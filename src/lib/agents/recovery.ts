import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { connectedAccounts, contacts, emailMessages, emailThreads, followUpDrafts, opportunities, users, workspaces } from "@/db/schema";
import { runStructured } from "@/lib/ai";
import { DRAFT_PROMPT, DraftSchema, untrusted } from "@/lib/ai/prompts";
import { extractAmounts, formatMoney } from "@/lib/intel/extract";

/**
 * RECOVERY AGENT — prepares follow-up drafts. Never sends email.
 * AI output is accepted only if it passes deterministic guards (no new amounts, no discounts/
 * promises absent from the source); otherwise a safe template is used.
 */
export type DraftKind = "lead_reply" | "proposal_followup" | "payment_reminder" | "client_checkin" | "renewal_reminder";

export function kindForCategory(category: string, reason?: string | null): DraftKind {
  if (category === "payment_followup") return "payment_reminder";
  if (category === "proposal_awaiting") return "proposal_followup";
  if (category === "unanswered_lead") return "lead_reply";
  if (reason === "renewal") return "renewal_reminder";
  return "client_checkin";
}

const RISKY = /\b(discount|% off|percent off|free of charge|waive|guarantee|legal action|collections?|debt collector|final notice|penalt(y|ies)|late fee)\b/i;

export function guardDraft(body: string, allowedText: string): string[] {
  const issues: string[] = [];
  const allowedAmounts = new Set(extractAmounts(allowedText).map((a) => `${a.amountCents}:${a.currency}`));
  for (const a of extractAmounts(body)) if (!allowedAmounts.has(`${a.amountCents}:${a.currency}`)) issues.push(`Introduces amount ${a.raw} not in source`);
  const risky = body.match(RISKY);
  if (risky && !RISKY.test(allowedText)) issues.push(`Introduces "${risky[0]}"`);
  if (/\[(name|client|company|amount|date)\]/i.test(body)) issues.push("Contains unfilled placeholder");
  return issues;
}

export function templateDraft(kind: DraftKind, f: { firstName: string | null; subject: string; amount: string | null; invoiceRef: string | null; dueDate: string | null; sender: string; signature?: string }) {
  const hi = `Hi ${f.firstName ?? "there"},`;
  const sign = f.signature?.trim() || `Best regards,\n${f.sender}`;
  const re = f.subject.toLowerCase().startsWith("re:") ? f.subject : `Re: ${f.subject}`;
  switch (kind) {
    case "lead_reply":
      return { subject: re, body: `${hi}\n\nThank you for getting in touch, and apologies for the slow reply. I'd be glad to help with this.\n\nCould we arrange a short call this week so I can understand what you need and confirm scope and pricing? Let me know a couple of times that suit you.\n\n${sign}` };
    case "proposal_followup":
      return { subject: re, body: `${hi}\n\nI wanted to check in on the proposal I sent${f.amount ? ` (${f.amount})` : ""}. Do you have any questions, or is there anything you'd like me to adjust in scope or timing?\n\nHappy to jump on a quick call if that's easier.\n\n${sign}` };
    case "payment_reminder":
      return { subject: re, body: `${hi}\n\nI hope you're well. This is a friendly reminder about invoice${f.invoiceRef ? ` ${f.invoiceRef}` : ""}${f.amount ? ` for ${f.amount}` : ""}${f.dueDate ? `, which was due on ${f.dueDate}` : ""}.\n\nIf it's already been paid, please disregard this note — and thank you! Otherwise, let me know if you need anything from me to process it.\n\n${sign}` };
    case "renewal_reminder":
      return { subject: re, body: `${hi}\n\nThanks for raising the renewal. I'd be happy to continue working together — shall we set up a short call to review how things have gone and agree the focus for the next term?\n\n${sign}` };
    default:
      return { subject: re, body: `${hi}\n\nI wanted to follow up on our conversation and make sure you have everything you need from me. Is there anything outstanding I can help with?\n\n${sign}` };
  }
}

export async function generateDraft(workspaceId: string, opportunityId: string, requestedKind?: DraftKind) {
  const [opp] = await db.select().from(opportunities).where(and(eq(opportunities.id, opportunityId), eq(opportunities.workspaceId, workspaceId)));
  if (!opp) throw new Error("Opportunity not found");
  const [thread] = await db.select().from(emailThreads).where(eq(emailThreads.id, opp.threadId));
  const [account] = await db.select().from(connectedAccounts).where(eq(connectedAccounts.id, thread.accountId));
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, ws.ownerUserId));
  const contact = opp.contactId ? (await db.select().from(contacts).where(eq(contacts.id, opp.contactId)))[0] : undefined;
  const msgs = (await db.select().from(emailMessages).where(eq(emailMessages.threadId, thread.id)).orderBy(asc(emailMessages.sentAt))).filter((m) => m.filterCategory === "candidate");
  const kind = requestedKind ?? kindForCategory(opp.category, opp.title.startsWith("Renewal") ? "renewal" : null);
  const toEmail = contact?.email ?? msgs.find((m) => m.direction === "inbound")?.fromEmail ?? msgs[0]?.toEmails[0];
  if (!toEmail) throw new Error("No recipient could be determined");
  const lastMsg = msgs[msgs.length - 1];
  const invoiceRef = msgs.map((m) => (m.signals as { invoiceRef?: string } | null)?.invoiceRef).filter(Boolean).pop() ?? null;
  const facts = {
    firstName: contact?.name?.split(" ")[0] ?? null,
    subject: thread.subject ?? "Following up",
    amount: opp.amountCents !== null ? formatMoney(opp.amountCents, opp.currency) : null,
    invoiceRef,
    dueDate: opp.dueDate ? opp.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null,
    sender: owner?.name ?? account.email,
    signature: ws.settings.signature,
  };
  let draft = templateDraft(kind, facts);
  let generatedBy = "template:v1";

  const sourceText = msgs.map((m) => m.bodyText ?? "").join("\n") + `\n${facts.amount ?? ""}`;
  const ai = await runStructured({
    workspaceId,
    task: "draft",
    agent: "recovery",
    promptVersion: DRAFT_PROMPT.version,
    schema: DraftSchema,
    targetRef: `opportunity:${opp.id}`,
    request: {
      system: DRAFT_PROMPT.system,
      user: `DRAFT TYPE: ${kind}\nFACTS (verified): ${JSON.stringify({ recipientFirstName: facts.firstName, amount: facts.amount, invoiceRef: facts.invoiceRef, dueDate: facts.dueDate, senderName: facts.sender, signature: facts.signature ?? null, opportunity: opp.title })}\n\nCONVERSATION (oldest first):\n${msgs.slice(-5).map((m) => untrusted(m.providerMessageId, `${m.direction === "outbound" ? "FROM BUSINESS OWNER" : `FROM ${m.fromName ?? m.fromEmail}`} on ${m.sentAt.toDateString()}:\n${m.bodyText ?? ""}`, 1200)).join("\n")}`,
      maxTokens: 500,
      temperature: 0.4,
    },
  });
  if (ai) {
    const issues = guardDraft(ai.data.body, sourceText);
    if (issues.length === 0) {
      draft = { subject: ai.data.subject, body: ai.data.body };
      generatedBy = `ai:${ai.provider}:${ai.model}:${DRAFT_PROMPT.version}`;
    } else {
      generatedBy = `template:v1 (AI draft rejected: ${issues.join("; ").slice(0, 150)})`;
    }
  }

  const [row] = await db
    .insert(followUpDrafts)
    .values({ workspaceId, opportunityId: opp.id, kind, toEmail, subject: draft.subject, body: draft.body, generatedBy })
    .returning();
  return { draft: row, inReplyTo: lastMsg?.headers?.["message-id"] };
}
