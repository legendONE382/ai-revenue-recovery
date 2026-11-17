import { and, eq, sql } from "drizzle-orm";
import { CheckCircle2, CircleAlert, Mail } from "lucide-react";
import { db } from "@/db";
import { agentTasks } from "@/db/schema";
import { AccountActions, ConnectDemoButton, SyncPoller } from "@/components/integration-actions";
import { Badge, Card, CardHeader, PageHeader, buttonClass, fmtDateTime } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { isEncryptionConfigured } from "@/lib/crypto";
import { listAccounts } from "@/lib/data";
import { GMAIL_SCOPES, googleConfigured } from "@/lib/gmail/oauth";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  google_not_configured: "Google OAuth is not configured on this server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / APP_URL / TOKEN_ENCRYPTION_KEY).",
  access_denied: "Google access was not granted.",
  invalid_state: "The sign-in request expired or didn't match your session. Please try again.",
  missing_scope: "Gmail read permission was not granted, so monitoring can't work. Please allow it when prompted.",
  exchange_failed: "Couldn't complete the Google connection. Please try again.",
};

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const accounts = await listAccounts(auth.workspace.id);
  const [pending] = await db.select({ n: sql<number>`count(*)::int` }).from(agentTasks).where(and(eq(agentTasks.workspaceId, auth.workspace.id), sql`${agentTasks.status} in ('queued','running')`));
  const ready = googleConfigured() && isEncryptionConfigured();
  const pushEnabled = Boolean(process.env.GMAIL_PUBSUB_TOPIC);

  return (
    <>
      <PageHeader title="Integrations" subtitle="Connected mailboxes and synchronisation status. Monitoring continues in the background — you don't need to keep this page open." />
      {sp.error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{ERRORS[sp.error] ?? "Connection failed."}</div>}
      {sp.connected && <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Connected {sp.connected}. Initial synchronisation has started.</div>}
      <SyncPoller active={(pending?.n ?? 0) > 0} />

      <Card className="mb-6">
        <CardHeader title="Connected mailboxes" />
        {accounts.length === 0 ? (
          <p className="px-5 py-6 text-sm text-stone-500">No mailboxes connected yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {accounts.map(({ account, sync }) => (
              <li key={account.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Mail size={15} className="text-stone-500" />
                    <span className="font-medium">{account.email}</span>
                    <Badge tone={account.provider === "demo" ? "violet" : "blue"}>{account.provider === "demo" ? "Sample inbox" : "Gmail"}</Badge>
                    <Badge tone={account.status === "active" ? "green" : "red"}>{account.status}</Badge>
                  </div>
                  {account.statusMessage && <p className="mt-1 flex items-center gap-1 text-xs text-red-700"><CircleAlert size={12} /> {account.statusMessage}</p>}
                  <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-stone-500 sm:grid-cols-4">
                    <div><dt>Phase</dt><dd className="text-stone-800">{sync?.phase ?? "idle"}</dd></div>
                    <div><dt>Messages synced</dt><dd className="tabular text-stone-800">{sync?.messagesSynced ?? 0}</dd></div>
                    <div><dt>Last sync</dt><dd className="text-stone-800">{fmtDateTime(sync?.lastSyncAt ?? null)}</dd></div>
                    <div><dt>Push watch</dt><dd className="text-stone-800">{account.provider === "demo" ? "n/a" : account.watchExpiration ? `until ${fmtDateTime(account.watchExpiration)}` : pushEnabled ? "pending" : "polling (15 min)"}</dd></div>
                  </dl>
                  {sync?.lastError && <p className="mt-1 text-xs text-amber-700">Last error: {sync.lastError}</p>}
                </div>
                <div className="flex flex-col gap-2 md:items-end">
                  {account.status !== "active" && account.provider === "gmail" && ready && <a href="/api/integrations/google/start" className={buttonClass("primary", "sm")}>Reconnect</a>}
                  <AccountActions id={account.id} active={account.status === "active"} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Gmail</h2>
          <p className="mt-1 text-sm text-stone-600">Read-only monitoring with optional draft creation. Requests these scopes:</p>
          <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-stone-500">{GMAIL_SCOPES.map((s) => <li key={s}>{s}</li>)}</ul>
          <div className="mt-4">
            {ready ? (
              <a href="/api/integrations/google/start" className={buttonClass("primary")}>Connect Gmail</a>
            ) : (
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                <div className="mb-1 flex items-center gap-1 font-medium"><CircleAlert size={12} /> Not configured on this server</div>
                Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL and TOKEN_ENCRYPTION_KEY. Restricted Gmail scopes require Google verification and a CASA security assessment before public use — until then only test users added in Google Cloud Console can connect. See README.
              </div>
            )}
          </div>
          <p className="mt-4 flex items-start gap-1.5 text-xs text-stone-500">
            <CheckCircle2 size={12} className="mt-0.5 shrink-0" /> Real-time updates: {pushEnabled ? "Pub/Sub push notifications enabled, with 15-minute polling as a safety net." : "Pub/Sub not configured — falls back to polling every 15 minutes via the scheduler."}
          </p>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Sample inbox (demo mode)</h2>
          <p className="mt-1 text-sm text-stone-600">19 realistic conversations — new leads, quiet proposals, overdue invoices, payment confirmations and deliberately misleading cases — run through the same pipeline as Gmail. Clearly labelled; never mixed with real data.</p>
          <div className="mt-4"><ConnectDemoButton /></div>
          <h3 className="mt-6 text-sm font-semibold">Coming later</h3>
          <p className="text-sm text-stone-500">Outlook / Microsoft 365 via Microsoft Graph — the connector interface is already provider-independent.</p>
        </Card>
      </div>
    </>
  );
}
