import { and, eq, isNull, sql } from "drizzle-orm";
import { after } from "next/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { db } from "@/db";
import { connectedAccounts, notifications, opportunities, syncState } from "@/db/schema";
import { AppNav } from "@/components/app-nav";
import { requireAuth } from "@/lib/auth";
import { enqueue } from "@/lib/jobs/queue";
import { runWorker } from "@/lib/jobs/worker";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const auth = await requireAuth();
  if (!auth.workspace.settings.onboardingComplete) redirect("/onboarding");
  const [o] = await db.select({ n: sql<number>`count(*)::int` }).from(opportunities).where(and(eq(opportunities.workspaceId, auth.workspace.id), eq(opportunities.status, "open")));
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.workspaceId, auth.workspace.id), isNull(notifications.readAt)));

  // Trigger a background sync when the user visits the app (fire-and-forget)
  const accounts = await db.select({ id: connectedAccounts.id, ws: connectedAccounts.workspaceId }).from(connectedAccounts).where(and(eq(connectedAccounts.workspaceId, auth.workspace.id), eq(connectedAccounts.status, "active")));
  for (const a of accounts) {
    // Check if last sync was more than 5 minutes ago
    const [state] = await db.select({ lastSyncAt: syncState.lastSyncAt }).from(syncState).where(eq(syncState.connectedAccountId, a.id));
    const stale = !state?.lastSyncAt || (Date.now() - state.lastSyncAt.getTime()) > 5 * 60 * 1000;
    if (stale) {
      await enqueue("incremental_sync", { accountId: a.id }, { workspaceId: a.ws, idempotencyKey: `visit:${a.id}:${Math.floor(Date.now() / 300000)}` });
    }
  }
  if (accounts.length > 0) {
    after(() => runWorker({ budgetMs: 8_000 }).catch(() => undefined));
  }

  return (
    <div className="min-h-screen">
      <AppNav email={auth.user.email} workspace={auth.workspace.name} counts={{ opps: o?.n ?? 0, unread: n?.n ?? 0 }} />
      <main className="lg:pl-60">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
