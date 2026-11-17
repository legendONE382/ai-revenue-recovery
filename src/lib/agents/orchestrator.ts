import "server-only";
import { and, asc, eq, gte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agentExecutionLogs,
  connectedAccounts,
  contacts,
  emailMessages,
  emailThreads,
  extractedFinancialRecords,
  notificationPreferences,
  notifications,
  opportunities,
  opportunityEvidence,
  workspaces,
  type WorkspaceSettings,
} from "@/db/schema";
import { runStructured } from "@/lib/ai";
import { CLASSIFY_PROMPT, ClassifySchema, untrusted } from "@/lib/ai/prompts";
import { sha256 } from "@/lib/crypto";
import { getConnector } from "@/lib/connectors";
import { validateCandidate } from "@/lib/intel/qa";
import { scoreOpportunity } from "@/lib/intel/score";
import { analyseThread } from "@/lib/intel/thread";
import { DEFAULT_SETTINGS, type DetectionSettings, type NormalizedMessage, type OpportunityCandidate } from "@/lib/intel/types";
import { excerptAround } from "@/lib/intel/extract";

/**
 * MASTER ORCHESTRATOR — coordinates the agents for one conversation:
 *   1. Email Understanding Agent  (deterministic: filter, signals, extraction, state machine)
 *   2. Lead / Proposal / Payment / Follow-up agents (deterministic detection rules in intel/thread.ts)
 *   3. AI interpretation — only for ambiguous threads, only with owner consent, cached by thread hash
 *   4. Quality Assurance Agent (evidence grounding, consistency)
 *   5. Persistence with lifecycle rules that respect user feedback
 * The Recovery Agent (drafts) runs on demand — see agents/recovery.ts.
 */
const CATEGORY_AGENT: Record<string, string> = {
  unanswered_lead: "lead_detection",
  proposal_awaiting: "proposal_tracking",
  payment_followup: "payment_intelligence",
  client_followup: "followup_intelligence",
};

export function detectionSettings(s: WorkspaceSettings): Partial<DetectionSettings> {
  const out: Partial<DetectionSettings> = {};
  if (s.leadResponseHours) out.leadResponseHours = s.leadResponseHours;
  if (s.proposalInactivityDays) out.proposalInactivityDays = s.proposalInactivityDays;
  if (s.paymentGraceDays !== undefined) out.paymentGraceDays = s.paymentGraceDays;
  if (s.followUpDays) out.followUpDays = s.followUpDays;
  return out;
}

type AiVerdict = { hash: string; isCommercial: boolean; intent: string; needsBusinessResponse: boolean; confidence: number; reason: string; model: string };

export async function analyseAndPersistThread(threadId: string, taskId: string | null = null, now = new Date()) {
  const [thread] = await db.select().from(emailThreads).where(eq(emailThreads.id, threadId));
  if (!thread) return { skipped: "thread not found" };
  const [account] = await db.select().from(connectedAccounts).where(eq(connectedAccounts.id, thread.accountId));
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, thread.workspaceId));
  if (!account || !ws) return { skipped: "missing account/workspace" };
  const rows = await db.select().from(emailMessages).where(eq(emailMessages.threadId, threadId)).orderBy(asc(emailMessages.sentAt));
  const suppressed = await db.select({ email: contacts.email }).from(contacts).where(and(eq(contacts.workspaceId, ws.id), eq(contacts.suppressed, true)));

  const msgs: NormalizedMessage[] = rows.map((r) => ({
    providerMessageId: r.providerMessageId,
    providerThreadId: thread.providerThreadId,
    from: { email: r.fromEmail, name: r.fromName },
    to: r.toEmails,
    cc: r.ccEmails,
    subject: r.subject ?? "",
    date: r.sentAt,
    bodyText: r.bodyText ?? "",
    snippet: r.snippet ?? "",
    labels: r.labels,
    headers: r.headers ?? {},
  }));
  const ownerEmails = new Set(getConnector(account).ownerEmails().map((e) => e.toLowerCase()));
  const t0 = Date.now();
  const analysis = analyseThread(msgs, { ownerEmails, now, settings: detectionSettings(ws.settings), suppressedContacts: new Set(suppressed.map((s) => s.email)) });
  const logs: (typeof agentExecutionLogs.$inferInsert)[] = [
    {
      workspaceId: ws.id,
      taskId,
      agent: "email_understanding",
      targetRef: `thread:${threadId}`,
      status: "ok",
      durationMs: Date.now() - t0,
      output: { classification: analysis.classification, stage: analysis.stage, status: analysis.status, signals: analysis.messages.reduce((n, m) => n + m.signals.length, 0), financials: analysis.financials.length },
    },
  ];
  for (const [cat, agent] of Object.entries(CATEGORY_AGENT)) {
    const found = analysis.candidates.filter((c) => c.category === cat);
    if (analysis.classification === "commercial") logs.push({ workspaceId: ws.id, taskId, agent, targetRef: `thread:${threadId}`, status: found.length ? "ok" : "skipped", output: { candidates: found.map((c) => ({ reason: c.reason, confidence: c.confidence })) } });
  }

  // 3. AI interpretation for ambiguous threads only (cost control + privacy).
  const hash = sha256(rows.map((r) => r.providerMessageId).join("|"));
  const prevAi = (thread.analysis as { ai?: AiVerdict } | null)?.ai;
  let ai: AiVerdict | undefined = prevAi?.hash === hash ? prevAi : undefined;
  if (!ai && analysis.ambiguous && analysis.contact && ws.settings.aiProcessingAllowed) {
    const recent = rows.filter((r) => r.filterCategory === "candidate").slice(-4);
    const res = await runStructured({
      workspaceId: ws.id,
      task: "classify",
      agent: "email_understanding_ai",
      promptVersion: CLASSIFY_PROMPT.version,
      schema: ClassifySchema,
      targetRef: `thread:${threadId}`,
      taskId,
      request: {
        system: CLASSIFY_PROMPT.system,
        user: `Business mailbox owner: ${account.email}\n\n${recent.map((r) => untrusted(r.providerMessageId, `From: ${r.direction === "outbound" ? "BUSINESS OWNER" : r.fromEmail}\nDate: ${r.sentAt.toISOString()}\nSubject: ${r.subject}\n\n${r.bodyText ?? ""}`, 1500)).join("\n\n")}`,
        maxTokens: 200,
        temperature: 0,
      },
    });
    if (res) ai = { hash, ...res.data, model: `${res.provider}:${res.model}` };
  }
  if (ai && ai.isCommercial && ai.needsBusinessResponse && ai.confidence >= 0.7 && analysis.status === "awaiting_business" && analysis.contact) {
    const lastIn = [...msgs].reverse().find((m) => !ownerEmails.has(m.from.email.toLowerCase()));
    if (lastIn && !analysis.candidates.length) {
      const hadOutbound = msgs.some((m) => ownerEmails.has(m.from.email.toLowerCase()) && m.date < lastIn.date);
      const name = analysis.contact.name || analysis.contact.email;
      analysis.candidates.push({
        category: hadOutbound ? "client_followup" : "unanswered_lead",
        reason: `ai_${ai.intent}`,
        title: hadOutbound ? `${name} may be waiting for your reply` : `Possible enquiry from ${name}`,
        summary: `AI interpretation (${ai.model}): ${ai.reason}. Deterministic rules were inconclusive, so confidence is capped.`,
        stage: hadOutbound ? analysis.stage : "new",
        amountCents: null,
        currency: null,
        amountMethod: null,
        confidence: Math.min(0.65, ai.confidence),
        lastInteractionAt: lastIn.date,
        dueDate: null,
        recommendedAction: "Review the conversation and reply if a response is expected.",
        evidence: [{ providerMessageId: lastIn.providerMessageId, kind: "ai_interpretation", excerpt: excerptAround(lastIn.bodyText, 0, 160), detail: { intent: ai.intent } }],
        assumptions: ["Identified by AI interpretation of ambiguous language; verify before acting."],
      });
      if (analysis.classification === "other") analysis.classification = "commercial";
    }
  }

  // 4. QA agent
  const accepted: OpportunityCandidate[] = [];
  const qaIssues: Record<string, string[]> = {};
  for (const c of analysis.candidates) {
    const r = validateCandidate(c, analysis, msgs);
    qaIssues[c.category] = r.issues;
    if (r.accepted) accepted.push(r.candidate);
  }
  if (analysis.candidates.length) logs.push({ workspaceId: ws.id, taskId, agent: "quality_assurance", targetRef: `thread:${threadId}`, status: "ok", output: { accepted: accepted.map((a) => a.category), issues: qaIssues } });

  // 5. Persist
  const contactRow = analysis.contact ? (await db.select().from(contacts).where(and(eq(contacts.workspaceId, ws.id), eq(contacts.email, analysis.contact.email))))[0] : undefined;
  const msgIdMap = new Map(rows.map((r) => [r.providerMessageId, r.id]));
  await db
    .update(emailThreads)
    .set({
      classification: analysis.classification,
      conversationStatus: analysis.status,
      primaryContactId: contactRow?.id ?? null,
      analysisHash: hash,
      analysedAt: now,
      analysis: { stage: analysis.stage, ambiguous: analysis.ambiguous, injectionSuspected: analysis.injectionSuspected, notes: analysis.notes, candidates: accepted.length, ...(ai ? { ai } : {}) },
    })
    .where(eq(emailThreads.id, threadId));
  for (const m of analysis.messages) {
    await db.update(emailMessages).set({ signals: { signals: m.signals.map((s) => ({ type: s.type, match: s.match })), amounts: m.amounts.map((a) => a.raw), dates: m.dates.map((d) => ({ raw: d.raw, date: d.date.toISOString() })), invoiceRef: m.invoiceRef } }).where(eq(emailMessages.id, msgIdMap.get(m.providerMessageId)!));
  }
  await db.delete(extractedFinancialRecords).where(and(eq(extractedFinancialRecords.threadId, threadId), eq(extractedFinancialRecords.status, "extracted")));
  if (analysis.financials.length) {
    await db
      .insert(extractedFinancialRecords)
      .values(analysis.financials.map((f) => ({ workspaceId: ws.id, threadId, messageId: msgIdMap.get(f.providerMessageId)!, kind: f.kind, amountCents: f.amountCents, currency: f.currency, rawText: f.rawText, dueDate: f.dueDate, reference: f.reference, confidence: f.confidence })))
      .onConflictDoNothing();
  }

  const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.workspaceId, ws.id));
  const existing = await db.select().from(opportunities).where(eq(opportunities.threadId, threadId));
  const lastAt = analysis.lastMessageAt ?? now;
  const created: string[] = [];

  for (const c of accepted) {
    const prev = existing.find((e) => e.category === c.category);
    const { score, factors } = scoreOpportunity({ category: c.category, amountCents: prev?.amountSource === "user" ? prev.amountCents : c.amountCents, currency: prev?.amountSource === "user" ? prev.currency : c.currency, confidence: c.confidence, lastInteractionAt: c.lastInteractionAt, dueDate: c.dueDate, messageCount: rows.length, now });
    const stateHash = sha256([c.category, c.reason, c.lastInteractionAt.toISOString(), c.amountCents ?? "", c.dueDate?.toISOString() ?? ""].join("|")).slice(0, 16);
    const fields = {
      contactId: contactRow?.id ?? null,
      title: c.title,
      summary: c.summary,
      confidence: c.confidence,
      priorityScore: score,
      priorityFactors: factors,
      recommendedAction: c.recommendedAction,
      lastInteractionAt: c.lastInteractionAt,
      dueDate: c.dueDate,
      stateHash,
      updatedAt: now,
    };
    let oppId: string;
    let event: "new" | "reopened" | null = null;
    if (prev) {
      if (prev.status === "dismissed" && prev.dismissedAtMessage && lastAt <= prev.dismissedAtMessage) continue; // user said false positive; no new evidence
      if (prev.status === "resolved" && prev.resolvedAt && lastAt <= prev.resolvedAt) continue;
      const overrides = prev.userOverrides ?? {};
      const reopen = prev.status === "dismissed" || prev.status === "resolved";
      await db
        .update(opportunities)
        .set({
          ...fields,
          stage: (overrides.stage as string | undefined) ?? c.stage,
          ...(prev.amountSource === "user" ? {} : { amountCents: c.amountCents, currency: c.currency, amountSource: c.amountCents !== null ? "extracted" : null }),
          ...(reopen ? { status: "open", resolution: null, resolvedAt: null } : {}),
          ...(prev.status === "snoozed" && prev.snoozedUntil && prev.snoozedUntil <= now ? { status: "open" } : {}),
        })
        .where(eq(opportunities.id, prev.id));
      oppId = prev.id;
      if (reopen) event = "reopened";
    } else {
      const [ins] = await db
        .insert(opportunities)
        .values({ workspaceId: ws.id, threadId, category: c.category, stage: c.stage, amountCents: c.amountCents, currency: c.currency, amountSource: c.amountCents !== null ? "extracted" : null, ...fields })
        .onConflictDoNothing()
        .returning({ id: opportunities.id });
      if (!ins) continue;
      oppId = ins.id;
      event = "new";
      created.push(oppId);
    }
    await db.delete(opportunityEvidence).where(eq(opportunityEvidence.opportunityId, oppId));
    await db.insert(opportunityEvidence).values([
      ...c.evidence.map((e) => ({ opportunityId: oppId, messageId: msgIdMap.get(e.providerMessageId) ?? null, kind: e.kind, excerpt: e.excerpt, detail: e.detail })),
      { opportunityId: oppId, messageId: null, kind: "methodology", excerpt: [c.amountMethod ? `Amount: ${c.amountMethod}.` : "No amount supported by evidence.", ...c.assumptions].join(" "), detail: { reason: c.reason, qaIssues: qaIssues[c.category] ?? [] } },
    ]);
    if (event && prefs && score >= prefs.minPriority) {
      const enabled = c.category === "payment_followup" ? prefs.paymentReminder : c.category === "proposal_awaiting" ? prefs.proposalInactivity : prefs.newOpportunity;
      if (enabled) {
        await db
          .insert(notifications)
          .values({ workspaceId: ws.id, opportunityId: oppId, type: event === "new" ? c.category : "reopened", title: event === "reopened" ? `Reopened: ${c.title}` : c.title, body: c.recommendedAction, dedupeKey: `${event}:${oppId}:${stateHash}` })
          .onConflictDoNothing();
      }
    }
  }

  // Auto-resolve opportunities no longer supported by the conversation (with outcome evidence).
  const acceptedCats = accepted.map((a) => a.category);
  const stale = existing.filter((e) => (e.status === "open" || e.status === "snoozed") && !acceptedCats.includes(e.category as OpportunityCandidate["category"]));
  for (const s of stale) {
    const resolution = analysis.stage === "paid" && s.category === "payment_followup" ? "paid" : analysis.stage === "won" ? "won" : analysis.stage === "lost" ? "lost" : "handled";
    await db
      .update(opportunities)
      .set({
        status: "resolved",
        resolution,
        resolvedAt: now,
        updatedAt: now,
        stage: resolution === "paid" ? "paid" : resolution === "won" ? "won" : resolution === "lost" ? "lost" : s.stage,
        recoveredAmountCents: resolution === "paid" ? s.amountCents : null,
      })
      .where(eq(opportunities.id, s.id));
    await db.insert(opportunityEvidence).values({ opportunityId: s.id, messageId: null, kind: "auto_resolution", excerpt: `Automatically resolved (${resolution}) — newer messages in the conversation no longer support this finding.` });
  }

  await db.insert(agentExecutionLogs).values(logs);
  return { classification: analysis.classification, accepted: accepted.length, created: created.length, resolved: stale.length };
}

/** Time-based re-evaluation (e.g. invoices crossing their due date) — no new email needed. */
export async function reevaluateWorkspace(workspaceId: string, taskId: string | null = null) {
  const since = new Date(Date.now() - 120 * 86_400_000);
  const threads = await db
    .select({ id: emailThreads.id })
    .from(emailThreads)
    .where(
      and(
        eq(emailThreads.workspaceId, workspaceId),
        gte(emailThreads.lastMessageAt, since),
        or(eq(emailThreads.classification, "commercial"), sql`exists (select 1 from opportunities o where o.thread_id = ${emailThreads.id} and o.status in ('open','snoozed'))`),
      ),
    );
  for (const t of threads) await analyseAndPersistThread(t.id, taskId);
  return threads.length;
}

/** Synchronously analyse every unanalysed thread for an account (used for the small demo mailbox). */
export async function analyseAllPending(workspaceId: string) {
  const threads = await db.select({ id: emailThreads.id }).from(emailThreads).where(and(eq(emailThreads.workspaceId, workspaceId), sql`${emailThreads.analysedAt} is null`));
  for (const t of threads) await analyseAndPersistThread(t.id);
  return threads.length;
}

