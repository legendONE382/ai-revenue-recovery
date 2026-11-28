import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  connectedAccounts,
  contacts,
  businessInsights,
  businessOfferings,
  businessProfileFacts,
  businessProfiles,
  emailIntelligence,
  emailMessages,
  emailThreads,
  extractedFinancialRecords,
  followUpDrafts,
  notifications,
  opportunities,
  opportunityEvidence,
  syncState,
} from "@/db/schema";

/** Every query here is scoped by workspaceId — the application-level tenant boundary. */

export type OppFilters = { status?: string; category?: string; q?: string; sort?: "priority" | "recent" | "amount"; limit?: number };

export async function listOpportunities(workspaceId: string, f: OppFilters = {}) {
  const conds = [eq(opportunities.workspaceId, workspaceId)];
  if (f.status && f.status !== "all") conds.push(eq(opportunities.status, f.status));
  if (f.category && f.category !== "all") conds.push(eq(opportunities.category, f.category));
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(opportunities.title, like), ilike(opportunities.summary, like), ilike(contacts.email, like), ilike(contacts.name, like), ilike(emailThreads.subject, like))!);
  }
  const order = f.sort === "recent" ? [desc(opportunities.lastInteractionAt)] : f.sort === "amount" ? [sql`${opportunities.amountCents} desc nulls last`] : [desc(opportunities.priorityScore), desc(opportunities.lastInteractionAt)];
  return db
    .select({
      id: opportunities.id,
      category: opportunities.category,
      stage: opportunities.stage,
      status: opportunities.status,
      resolution: opportunities.resolution,
      title: opportunities.title,
      summary: opportunities.summary,
      amountCents: opportunities.amountCents,
      currency: opportunities.currency,
      amountSource: opportunities.amountSource,
      confidence: opportunities.confidence,
      priorityScore: opportunities.priorityScore,
      recommendedAction: opportunities.recommendedAction,
      lastInteractionAt: opportunities.lastInteractionAt,
      dueDate: opportunities.dueDate,
      snoozedUntil: opportunities.snoozedUntil,
      resolvedAt: opportunities.resolvedAt,
      recoveredAmountCents: opportunities.recoveredAmountCents,
      contactName: contacts.name,
      contactEmail: contacts.email,
      companyDomain: companies.domain,
      companyName: companies.name,
      providerThreadId: emailThreads.providerThreadId,
      threadId: emailThreads.id,
      provider: connectedAccounts.provider,
      accountEmail: connectedAccounts.email,
    })
    .from(opportunities)
    .innerJoin(emailThreads, eq(emailThreads.id, opportunities.threadId))
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, emailThreads.accountId))
    .leftJoin(contacts, eq(contacts.id, opportunities.contactId))
    .leftJoin(companies, eq(companies.id, contacts.companyId))
    .where(and(...conds))
    .orderBy(...order)
    .limit(f.limit ?? 200);
}
export type OpportunityRow = Awaited<ReturnType<typeof listOpportunities>>[number];

export function gmailLink(provider: string, accountEmail: string, providerThreadId: string): string | null {
  if (provider !== "gmail") return null;
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(accountEmail)}#all/${encodeURIComponent(providerThreadId)}`;
}

export async function getOpportunity(workspaceId: string, id: string) {
  const rows = await listOpportunities(workspaceId, { status: "all", limit: 1000 });
  const opp = rows.find((r) => r.id === id);
  if (!opp) return null;
  const [raw] = await db.select({ userOverrides: opportunities.userOverrides, priorityFactors: opportunities.priorityFactors, contactId: opportunities.contactId, detectedAt: opportunities.detectedAt }).from(opportunities).where(eq(opportunities.id, id));
  const evidence = await db.select().from(opportunityEvidence).where(eq(opportunityEvidence.opportunityId, id)).orderBy(asc(opportunityEvidence.createdAt));
  const messages = await db.select().from(emailMessages).where(eq(emailMessages.threadId, opp.threadId)).orderBy(asc(emailMessages.sentAt));
  const financials = await db.select().from(extractedFinancialRecords).where(eq(extractedFinancialRecords.threadId, opp.threadId)).orderBy(asc(extractedFinancialRecords.createdAt));
  const drafts = await db.select().from(followUpDrafts).where(eq(followUpDrafts.opportunityId, id)).orderBy(desc(followUpDrafts.createdAt));
  const [thread] = await db.select({ analysis: emailThreads.analysis, status: emailThreads.conversationStatus, classification: emailThreads.classification }).from(emailThreads).where(eq(emailThreads.id, opp.threadId));
  return { opp, ...raw, evidence, messages, financials, drafts, thread };
}

export async function overview(workspaceId: string) {
  const counts = await db
    .select({ category: opportunities.category, status: opportunities.status, n: sql<number>`count(*)::int` })
    .from(opportunities)
    .where(eq(opportunities.workspaceId, workspaceId))
    .groupBy(opportunities.category, opportunities.status);
  const open = (cat?: string) => counts.filter((c) => c.status === "open" && (!cat || c.category === cat)).reduce((n, c) => n + c.n, 0);
  const [attention] = await db.select({ n: sql<number>`count(*)::int` }).from(emailThreads).where(and(eq(emailThreads.workspaceId, workspaceId), eq(emailThreads.conversationStatus, "awaiting_business"), eq(emailThreads.classification, "commercial")));
  return {
    activeOpportunities: open(),
    attention: attention?.n ?? 0,
    leads: open("unanswered_lead"),
    proposals: open("proposal_awaiting"),
    payments: open("payment_followup"),
    clientFollowups: open("client_followup"),
    snoozed: counts.filter((c) => c.status === "snoozed").reduce((n, c) => n + c.n, 0),
  };
}

type Money = Record<string, number>;
const addMoney = (m: Money, cur: string | null, cents: number | null) => {
  if (cents === null || cents === undefined) return;
  const k = cur ?? "USD";
  m[k] = (m[k] ?? 0) + Number(cents);
};

/** Four strictly separated financial figures — never merged into one number, never cross-currency. */
export async function analytics(workspaceId: string) {
  const all = await db.select().from(opportunities).where(eq(opportunities.workspaceId, workspaceId));
  const confirmedRecovered: Money = {};
  const atRisk: Money = {};
  const potential: Money = {};
  const wonValue: Money = {};
  let recoveredCount = 0;
  for (const o of all) {
    if (o.status === "resolved" && o.resolution === "paid" && o.recoveredAmountCents !== null) {
      addMoney(confirmedRecovered, o.currency, o.recoveredAmountCents);
      recoveredCount++;
    }
    if (o.status === "resolved" && o.resolution === "won") addMoney(wonValue, o.currency, o.amountCents);
    if ((o.status === "open" || o.status === "snoozed") && o.category === "payment_followup") addMoney(atRisk, o.currency, o.amountCents);
    if ((o.status === "open" || o.status === "snoozed") && (o.category === "proposal_awaiting" || o.category === "unanswered_lead")) addMoney(potential, o.currency, o.amountCents);
  }
  const drafts = await db.select({ status: followUpDrafts.status, n: sql<number>`count(*)::int` }).from(followUpDrafts).where(eq(followUpDrafts.workspaceId, workspaceId)).groupBy(followUpDrafts.status);
  const d = (s: string) => drafts.find((x) => x.status === s)?.n ?? 0;
  const byCategory: Record<string, number> = {};
  const byResolution: Record<string, number> = {};
  for (const o of all) {
    byCategory[o.category] = (byCategory[o.category] ?? 0) + 1;
    if (o.status === "resolved") byResolution[o.resolution ?? "resolved"] = (byResolution[o.resolution ?? "resolved"] ?? 0) + 1;
  }
  const dismissed = all.filter((o) => o.status === "dismissed").length;
  return {
    identified: all.length,
    open: all.filter((o) => o.status === "open").length,
    resolved: all.filter((o) => o.status === "resolved").length,
    dismissed,
    falsePositiveRate: all.length ? dismissed / all.length : 0,
    recoveredCount,
    confirmedRecovered,
    atRisk,
    potential,
    wonValue,
    draftsPrepared: drafts.reduce((n, x) => n + x.n, 0),
    gmailDrafts: d("gmail_draft_created") + d("sent_confirmed"),
    sentConfirmed: d("sent_confirmed"),
    byCategory,
    byResolution,
    unknownAmount: all.filter((o) => o.amountCents === null && o.status === "open").length,
  };
}

export async function listThreads(workspaceId: string, opts: { filter?: string; q?: string } = {}) {
  const conds = [eq(emailThreads.workspaceId, workspaceId)];
  if (opts.filter === "commercial") conds.push(eq(emailThreads.classification, "commercial"));
  else if (opts.filter === "attention") conds.push(eq(emailThreads.conversationStatus, "awaiting_business"), eq(emailThreads.classification, "commercial"));
  else if (opts.filter === "filtered") conds.push(inArray(emailThreads.classification, ["newsletter", "notification", "spam", "auto_reply"]));
  if (opts.q) conds.push(ilike(emailThreads.subject, `%${opts.q.replace(/[%_]/g, "")}%`));
  return db
    .select({
      id: emailThreads.id,
      subject: emailThreads.subject,
      classification: emailThreads.classification,
      status: emailThreads.conversationStatus,
      lastMessageAt: emailThreads.lastMessageAt,
      messageCount: emailThreads.messageCount,
      analysis: emailThreads.analysis,
      contactName: contacts.name,
      contactEmail: contacts.email,
      openOpps: sql<number>`(select count(*)::int from opportunities o where o.thread_id = ${emailThreads.id} and o.status = 'open')`,
    })
    .from(emailThreads)
    .leftJoin(contacts, eq(contacts.id, emailThreads.primaryContactId))
    .where(and(...conds))
    .orderBy(desc(emailThreads.lastMessageAt))
    .limit(300);
}

export async function getThread(workspaceId: string, id: string) {
  const [t] = await db.select().from(emailThreads).where(and(eq(emailThreads.id, id), eq(emailThreads.workspaceId, workspaceId)));
  if (!t) return null;
  const messages = await db.select().from(emailMessages).where(eq(emailMessages.threadId, id)).orderBy(asc(emailMessages.sentAt));
  const opps = await db.select().from(opportunities).where(eq(opportunities.threadId, id));
  const [account] = await db.select().from(connectedAccounts).where(eq(connectedAccounts.id, t.accountId));
  return { thread: t, messages, opps, account };
}

export async function listDrafts(workspaceId: string) {
  return db
    .select({ draft: followUpDrafts, oppTitle: opportunities.title, oppCategory: opportunities.category })
    .from(followUpDrafts)
    .innerJoin(opportunities, eq(opportunities.id, followUpDrafts.opportunityId))
    .where(eq(followUpDrafts.workspaceId, workspaceId))
    .orderBy(desc(followUpDrafts.updatedAt))
    .limit(200);
}

export async function listAccounts(workspaceId: string) {
  return db
    .select({ account: connectedAccounts, sync: syncState })
    .from(connectedAccounts)
    .leftJoin(syncState, eq(syncState.connectedAccountId, connectedAccounts.id))
    .where(eq(connectedAccounts.workspaceId, workspaceId))
    .orderBy(asc(connectedAccounts.createdAt));
}

export async function recentNotifications(workspaceId: string, limit = 20) {
  return db.select().from(notifications).where(eq(notifications.workspaceId, workspaceId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function getBusinessProfile(workspaceId: string) {
  const [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.workspaceId, workspaceId));
  const offerings = profile ? await db.select().from(businessOfferings).where(eq(businessOfferings.profileId, profile.id)) : [];
  const facts = profile ? await db.select().from(businessProfileFacts).where(eq(businessProfileFacts.profileId, profile.id)) : [];
  const insights = await db.select().from(businessInsights).where(eq(businessInsights.workspaceId, workspaceId));
  return { profile: profile ?? null, offerings, facts, insights };
}

export async function mailboxIntelligence(workspaceId: string) {
  const [emailsReviewed] = await db.select({ n: sql<number>`count(*)::int` }).from(emailIntelligence).where(eq(emailIntelligence.workspaceId, workspaceId));
  const [conversations] = await db.select({ n: sql<number>`count(*)::int` }).from(emailThreads).where(eq(emailThreads.workspaceId, workspaceId));
  const [businessRelated] = await db.select({ n: sql<number>`count(*)::int` }).from(emailThreads).where(and(eq(emailThreads.workspaceId, workspaceId), eq(emailThreads.classification, "commercial")));
  const [contactsCount] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(eq(contacts.workspaceId, workspaceId));
  const [needsAttention] = await db.select({ n: sql<number>`count(*)::int` }).from(emailThreads).where(and(eq(emailThreads.workspaceId, workspaceId), eq(emailThreads.conversationStatus, "awaiting_business")));
  return {
    emailsReviewed: emailsReviewed?.n ?? 0,
    conversations: conversations?.n ?? 0,
    businessRelated: businessRelated?.n ?? 0,
    contacts: contactsCount?.n ?? 0,
    needsAttention: needsAttention?.n ?? 0,
  };
}

export async function communicationBreakdown(workspaceId: string) {
  const rows = await db
    .select({ category: emailIntelligence.primaryCategory, n: sql<number>`count(*)::int` })
    .from(emailIntelligence)
    .where(eq(emailIntelligence.workspaceId, workspaceId))
    .groupBy(emailIntelligence.primaryCategory);
  return rows;
}
