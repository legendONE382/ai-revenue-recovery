import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agentTasks, emailThreads, opportunities } from "@/db/schema";
import { listAccounts } from "@/lib/data";
import { json, withAuth } from "@/lib/http";

/** Connection + synchronisation status for progress UIs (polled by the client). */
export const GET = withAuth(async (_req, auth) => {
  const ws = auth.workspace.id;
  const accounts = await listAccounts(ws);
  const [threads] = await db.select({ total: sql<number>`count(*)::int`, analysed: sql<number>`count(${emailThreads.analysedAt})::int` }).from(emailThreads).where(eq(emailThreads.workspaceId, ws));
  const [opps] = await db.select({ n: sql<number>`count(*)::int` }).from(opportunities).where(and(eq(opportunities.workspaceId, ws), eq(opportunities.status, "open")));
  const [queue] = await db.select({ n: sql<number>`count(*)::int` }).from(agentTasks).where(and(eq(agentTasks.workspaceId, ws), sql`${agentTasks.status} in ('queued','running')`));
  return json({
    accounts: accounts.map(({ account, sync }) => ({ id: account.id, provider: account.provider, email: account.email, status: account.status, statusMessage: account.statusMessage, phase: sync?.phase ?? "idle", messagesSynced: sync?.messagesSynced ?? 0, lastSyncAt: sync?.lastSyncAt, lastError: sync?.lastError })),
    threads: threads ?? { total: 0, analysed: 0 },
    openOpportunities: opps?.n ?? 0,
    pendingJobs: queue?.n ?? 0,
  });
});
