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

/**
 * Idempotent ingestion: unique (account, provider_message_id) means re-delivered messages are
 * ignored. Data minimisation: bodies of newsletters/notifications/spam are NOT stored.
 */
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
    return true; // non-retryable; user must reconnect
  }
  return false;
}

/** One page of initial sync per job run — bounded duration, resumable via stored page token. */
export async function runInitialSyncPage(accountId: string): Promise<{ done: boolean; synced: number }> {
  const account = await loadAccount(accountId);
  if (!account || account.status !== "active") return { done: true, synced: 0 };
  const connector = getConnector(account);
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, account.workspaceId));
    const days = Math.min(7, Math.max(1, ws?.settings?.monitoringDays ? Math.min(ws.settings.monitoringDays, 7) : 7));
  try {
    let [state] = await db.select().from(syncState).where(eq(syncState.connectedAccountId, accountId));
    if (!state) [state] = await db.insert(syncState).values({ connectedAccountId: accountId }).returning();
    if (!state.historyId || state.phase !== "initial") {
      // Record cursor BEFORE listing so changes during the initial sync are caught incrementally.
      const cursor = await connector.currentCursor();
      [state] = await db.update(syncState).set({ phase: "initial", historyId: cursor, startedAt: new Date(), lastError: null, pageToken: state.phase === "initial" ? state.pageToken : null }).where(eq(syncState.connectedAccountId, accountId)).returning();
    }
    const page = await connector.listInitialIds(days, state.pageToken ?? undefined);
    const fresh = await newIdsOnly(accountId, page.ids);
    const msgs = await connector.getMessages(fresh);
    const touched = await ingestMessages(account, msgs);
    await enqueueAnalyses(account.workspaceId, touched);
    const done = !page.nextPageToken;
    await db
      .update(syncState)
      .set({
        messagesSynced: sql`${syncState.messagesSynced} + ${msgs.length}`,
        pageToken: page.nextPageToken ?? null,
        lastSyncAt: new Date(),
        ...(done ? { phase: "incremental", completedAt: new Date() } : {}),
      })
      .where(eq(syncState.connectedAccountId, accountId));
    if (!done) await enqueue("initial_sync", { accountId }, { workspaceId: account.workspaceId, idempotencyKey: `initial:${accountId}:${page.nextPageToken}` });
    else if (connector.startWatch) await startWatch(accountId);
    return { done, synced: msgs.length };
  } catch (e) {
    if (await handleAuthFailure(accountId, e)) return { done: true, synced: 0 };
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
      // Safe resync: ingestion is idempotent, so a full re-list only adds what is missing.
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

/** Gmail watches expire after 7 days; Google recommends re-calling watch daily. */
export async function renewWatches() {
  if (!process.env.GMAIL_PUBSUB_TOPIC) return 0;
  const due = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.provider, "gmail"), eq(connectedAccounts.status, "active"), sql`(${connectedAccounts.watchExpiration} is null or ${connectedAccounts.watchExpiration} < now() + interval '2 days')`));
  for (const a of due) await startWatch(a.id);
  return due.length;
}
