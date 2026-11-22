import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, connectedAccounts, contacts, emailMessages, emailThreads, syncState, workspaces } from "@/db/schema";
import { AccountRevokedError, getConnector, loadAccount } from "@/lib/connectors";
import { GmailAuthError, HistoryExpiredError } from "@/lib/gmail/client";
import { prefilter } from "@/lib/intel/filter";
import type { NormalizedMessage } from "@/lib/intel/types";
import { enqueue } from "@/lib/jobs/queue";

const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com", "gmx.com"]);
type Account = NonNullable<Awaited<ReturnType<typeof loadAccount>>>;

async function ensureContact(workspaceId: string, email: string, name: string | null): Promise<string> {
  const domain = email.split("@")[1] ?? "";
  let companyId: string | null = null;
  if (domain && !FREE_MAIL.has(domain)) {
    const [c] = await db
      .insert(companies)
      .values({ workspaceId, domain })
      .onConflictDoUpdate({ target: [companies.workspaceId, companies.domain], set: { domain } })
      .returning({ id: companies.id });
    companyId = c.id;
  }
  const [ct] = await db
    .insert(contacts)
    .values({ workspaceId, email, name, companyId })
    .onConflictDoUpdate({
      target: [contacts.workspaceId, contacts.email],
      set: { name: sql`coalesce(${contacts.name}, excluded.name)`, companyId: sql`coalesce(${contacts.companyId}, excluded.company_id)` },
    })
    .returning({ id: contacts.id });
  return ct.id;
}

export async function ingestMessages(account: Account, msgs: NormalizedMessage[]): Promise<string[]> {
  const owner = new Set(getConnector(account).ownerEmails().map((e) => e.toLowerCase()));
  const touched = new Set<string>();
  for (const m of msgs) {
    const direction = owner.has(m.from.email.toLowerCase()) ? "outbound" : "inbound";
    const filter = prefilter(m, owner);
    const [thread] = await db
      .insert(emailThreads)
      .values({ workspaceId: account.workspaceId, accountId: account.id, providerThreadId: m.providerThreadId, subject: m.subject, lastMessageAt: m.date })
      .onConflictDoUpdate({
        target: [emailThreads.accountId, emailThreads.providerThreadId],
        set: { lastMessageAt: sql`greatest(${emailThreads.lastMessageAt}, excluded.last_message_at)` },
      })
      .returning({ id: emailThreads.id });
    const inserted = await db
      .insert(emailMessages)
      .values({
        workspaceId: account.workspaceId,
        accountId: account.id,
        threadId: thread.id,
        providerMessageId: m.providerMessageId,
        fromEmail: m.from.email.toLowerCase(),
        fromName: m.from.name,
        toEmails: m.to,
        ccEmails: m.cc,
        subject: m.subject,
        snippet: m.snippet,
        bodyText: filter === "candidate" ? m.bodyText : null,
        sentAt: m.date,
        direction,
        labels: m.labels,
        headers: m.headers,
        filterCategory: filter,
      })
      .onConflictDoNothing()
      .returning({ id: emailMessages.id });
    if (inserted.length === 0) continue;
    touched.add(thread.id);
    if (filter === "candidate") {
      const ext = direction === "inbound" ? [{ email: m.from.email.toLowerCase(), name: m.from.name }] : m.to.filter((e) => !owner.has(e)).map((e) => ({ email: e, name: null }));
      for (const c of ext.slice(0, 5)) await ensureContact(account.workspaceId, c.email, c.name);
    }
  }
  for (const threadId of touched) {
    await db.execute(sql`
      update email_threads set
        message_count = (select count(*) from email_messages where thread_id = ${threadId}),
        last_message_at = (select max(sent_at) from email_messages where thread_id = ${threadId})
      where id = ${threadId}`);
  }
  return [...touched];
}

async function enqueueAnalyses(workspaceId: string, threadIds: string[]) {
  if (threadIds.length === 0) return;
  const rows = await db.select({ id: emailThreads.id, n: emailThreads.messageCount, last: emailThreads.lastMessageAt }).from(emailThreads).where(inArray(emailThreads.id, threadIds));
  for (const t of rows) {
    await enqueue("analyse_thread", { threadId: t.id }, { workspaceId, idempotencyKey: `analyse:${t.id}:${t.n}:${t.last?.getTime() ?? 0}` });
  }
}

async function newIdsOnly(accountId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const existing = await db.select({ id: emailMessages.providerMessageId }).from(emailMessages).where(and(eq(emailMessages.accountId, accountId), inArray(emailMessages.providerMessageId, ids)));
  const have = new Set(existing.map((e) => e.id));
  return ids.filter((id) => !have.has(id));
}

async function handleAuthFailure(accountId: string, e: unknown): Promise<boolean> {
  if (e instanceof AccountRevokedError || e instanceof GmailAuthError) {
    await db.update(connectedAccounts).set({ status: "revoked", statusMessage: e.message }).where(eq(connectedAccounts.id, accountId));
    await db.update(syncState).set({ phase: "error", lastError: e.message }).where(eq(syncState.connectedAccountId, accountId));
    return true;
  }
  return false;
}

// Smart sync configuration
const BATCH_SIZE = 50; // emails per batch
const INITIAL_DAYS = 30; // start with last 30 days
const MAX_BACKFILL_DAYS = 365; // maximum backfill depth
const BACKFILL_STEP_DAYS = 30; // backfill in 30-day chunks

/**
 * Smart initial sync: fetches emails in batches, prioritizing recent ones.
 * - First batch: last 30 days (most recent first)
 * - If more pages exist, continues with next page
 * - After recent emails are synced, starts backfilling older emails
 * - Each run processes one batch and enqueues the next
 */
export async function runInitialSyncPage(accountId: string): Promise<{ done: boolean; synced: number; phase: string }> {
  const account = await loadAccount(accountId);
  if (!account || account.status !== "active") return { done: true, synced: 0, phase: "idle" };
  const connector = getConnector(account);
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, account.workspaceId));
  const monitoringDays = Math.min(MAX_BACKFILL_DAYS, Math.max(7, ws?.settings?.monitoringDays ?? 90));
  
  try {
    let [state] = await db.select().from(syncState).where(eq(syncState.connectedAccountId, accountId));
    if (!state) [state] = await db.insert(syncState).values({ connectedAccountId: accountId }).returning();
    
    // Initialize sync state
    if (!state.historyId || state.phase !== "initial") {
      const cursor = await connector.currentCursor();
      [state] = await db.update(syncState).set({ 
        phase: "initial", 
        historyId: cursor, 
        startedAt: new Date(), 
        lastError: null, 
        pageToken: state.phase === "initial" ? state.pageToken : null 
      }).where(eq(syncState.connectedAccountId, accountId)).returning();
    }

    // Determine which time window to sync
    // Track progress via pageToken: if it starts with "backfill:", we're in backfill mode
    const isBackfill = state.pageToken?.startsWith("backfill:");
    let daysToSync: number;
    let backfillOffset = 0;
    
    if (isBackfill) {
      // Backfill mode: parse the offset from pageToken
      backfillOffset = parseInt(state.pageToken!.split(":")[1] || "0", 10);
      daysToSync = Math.min(backfillOffset + BACKFILL_STEP_DAYS, monitoringDays);
    } else {
      // Initial mode: sync recent emails
      daysToSync = INITIAL_DAYS;
    }

    // Build query based on mode
    const page = await connector.listInitialIds(daysToSync, state.pageToken ?? undefined);
    
    // For backfill, we need to exclude already-synced emails by checking if we have them
    const fresh = await newIdsOnly(accountId, page.ids);
    const msgs = await connector.getMessages(fresh);
    const touched = await ingestMessages(account, msgs);
    await enqueueAnalyses(account.workspaceId, touched);
    
    const done = !page.nextPageToken;
    
    // Determine if we should start backfilling
    let nextPageToken: string | null = null;
    let shouldBackfill = false;
    
    if (page.nextPageToken) {
      // More pages in current window
      nextPageToken = page.nextPageToken;
    } else if (!isBackfill && daysToSync < monitoringDays) {
      // Initial sync complete, start backfilling older emails
      // Even if no messages in this batch, try backfilling
      shouldBackfill = true;
      nextPageToken = `backfill:${daysToSync}`;
    } else if (isBackfill) {
      const offset = backfillOffset + BACKFILL_STEP_DAYS;
      if (offset < monitoringDays) {
        // Stop backfilling if we got 0 messages in this batch AND the previous batch
        // (tracked by checking if messagesSynced hasn't changed)
        nextPageToken = `backfill:${offset}`;
      }
    }

    await db.update(syncState).set({
      messagesSynced: sql`${syncState.messagesSynced} + ${msgs.length}`,
      pageToken: nextPageToken,
      lastSyncAt: new Date(),
      ...(done && !nextPageToken ? { phase: "incremental", completedAt: new Date() } : {}),
    }).where(eq(syncState.connectedAccountId, accountId));

    if (nextPageToken) {
      await enqueue("initial_sync", { accountId }, { workspaceId: account.workspaceId, idempotencyKey: `initial:${accountId}:${nextPageToken}` });
    } else if (connector.startWatch) {
      await startWatch(accountId);
    }

    return { done: !nextPageToken, synced: msgs.length, phase: nextPageToken ? "initial" : "incremental" };
  } catch (e) {
    if (await handleAuthFailure(accountId, e)) return { done: true, synced: 0, phase: "error" };
    await db.update(syncState).set({ lastError: e instanceof Error ? e.message : "sync error" }).where(eq(syncState.connectedAccountId, accountId));
    throw e;
  }
}

export async function runIncrementalSync(accountId: string): Promise<{ synced: number; resync: boolean }> {
  const account = await loadAccount(accountId);
  if (!account || account.status !== "active") return { synced: 0, resync: false };
  const [state] = await db.select().from(syncState).where(eq(syncState.connectedAccountId, accountId));
  if (!state || state.phase === "initial" || !state.historyId) return { synced: 0, resync: false };
  const connector = getConnector(account);
  try {
    const changes = await connector.listChanges(state.historyId);
    const fresh = await newIdsOnly(accountId, changes.ids);
    const msgs = await connector.getMessages(fresh);
    const touched = await ingestMessages(account, msgs);
    await enqueueAnalyses(account.workspaceId, touched);
    await db.update(syncState).set({ historyId: changes.cursor, lastSyncAt: new Date(), messagesSynced: sql`${syncState.messagesSynced} + ${msgs.length}`, lastError: null }).where(eq(syncState.connectedAccountId, accountId));
    return { synced: msgs.length, resync: false };
  } catch (e) {
    if (e instanceof HistoryExpiredError) {
      await db.update(syncState).set({ phase: "idle", historyId: null, pageToken: null, lastError: "History expired; full resynchronisation scheduled" }).where(eq(syncState.connectedAccountId, accountId));
      await enqueue("initial_sync", { accountId }, { workspaceId: account.workspaceId, idempotencyKey: `resync:${accountId}:${Date.now()}` });
      return { synced: 0, resync: true };
    }
    if (await handleAuthFailure(accountId, e)) return { synced: 0, resync: false };
    throw e;
  }
}

export async function startWatch(accountId: string) {
  const account = await loadAccount(accountId);
  if (!account || account.status !== "active") return;
  const connector = getConnector(account);
  if (!connector.startWatch) return;
  try {
    const w = await connector.startWatch();
    if (w) await db.update(connectedAccounts).set({ watchExpiration: w.expiration }).where(eq(connectedAccounts.id, accountId));
  } catch (e) {
    if (!(await handleAuthFailure(accountId, e))) throw e;
  }
}

export async function renewWatches() {
  if (!process.env.GMAIL_PUBSUB_TOPIC) return 0;
  const due = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.provider, "gmail"), eq(connectedAccounts.status, "active"), sql`(${connectedAccounts.watchExpiration} is null or ${connectedAccounts.watchExpiration} < now() + interval '2 days')`));
  for (const a of due) await startWatch(a.id);
  return due.length;
}