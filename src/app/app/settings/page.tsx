import { desc, eq, inArray, sql } from "drizzle-orm";
import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { db } from "@/db";
import { agentTasks, aiProviderKeys, notificationPreferences } from "@/db/schema";
import { AccountForm } from "@/components/account-form";
import { SettingsForms } from "@/components/settings-forms";
import { Card, CardHeader, PageHeader, fmtDateTime, timeAgo } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { isEncryptionConfigured } from "@/lib/crypto";
import { configChecks, emailConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const auth = await requireAuth();
  const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.workspaceId, auth.workspace.id));
  const keys = await db.select({ provider: aiProviderKeys.provider, model: aiProviderKeys.model }).from(aiProviderKeys).where(eq(aiProviderKeys.workspaceId, auth.workspace.id));
  const managed = (["gemini", "groq", "mistral", "openai"] as const).filter((p) => !!process.env[`${p.toUpperCase()}_API_KEY`]);
  // Scheduler health: recurring jobs are only created by /api/cron/tick.
  const [lastTick] = await db.select({ at: agentTasks.createdAt }).from(agentTasks).where(inArray(agentTasks.type, ["fire_reminders", "renew_watches"])).orderBy(desc(agentTasks.createdAt)).limit(1);
  const [dead] = await db.select({ n: sql<number>`count(*)::int` }).from(agentTasks).where(sql`${agentTasks.status} = 'dead' and ${agentTasks.workspaceId} = ${auth.workspace.id}`);
  const tickAgeMin = lastTick ? (Date.now() - lastTick.at.getTime()) / 60000 : null;
  const checks = configChecks();

  return (
    <>
      <PageHeader title="Settings" subtitle="Account, detection thresholds, privacy, AI providers, notifications and your data." />
      <div className="space-y-6">
        <AccountForm name={auth.user.name} email={auth.user.email} />
        <SettingsForms
          name={auth.workspace.name}
          settings={auth.workspace.settings}
          prefs={prefs ?? { newOpportunity: true, overdueFollowUp: true, proposalInactivity: true, paymentReminder: true, dailySummary: true, emailNotifications: true, minPriority: 30 }}
          keys={keys}
          managedProviders={managed}
          encryptionReady={isEncryptionConfigured()}
          emailReady={emailConfigured()}
        />
        <Card>
          <CardHeader title="Deployment status" hint="Which server features are configured. Values are never shown — only whether they are set." />
          <ul className="divide-y divide-[var(--color-line)] text-sm">
            {checks.map((c) => (
              <li key={c.key} className="flex items-start gap-3 px-5 py-3">
                {c.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-700" /> : c.required ? <CircleAlert size={16} className="mt-0.5 shrink-0 text-red-600" /> : <CircleDashed size={16} className="mt-0.5 shrink-0 text-stone-400" />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {c.label} <span className="font-mono text-[11px] font-normal text-stone-400">{c.key}</span>
                    {!c.ok && <span className={`ml-2 text-xs ${c.required ? "text-red-600" : "text-stone-500"}`}>{c.required ? "required" : "optional"}</span>}
                  </div>
                  {!c.ok && <div className="text-xs text-stone-500">{c.hint}</div>}
                </div>
              </li>
            ))}
            <li className="flex items-start gap-3 px-5 py-3">
              {tickAgeMin !== null && tickAgeMin < 20 ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-700" /> : <CircleAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />}
              <div>
                <div className="font-medium">Background scheduler</div>
                <div className="text-xs text-stone-500">
                  {lastTick ? `Last run ${timeAgo(lastTick.at)} (${fmtDateTime(lastTick.at)}).` : "Has never run."}{" "}
                  {(tickAgeMin === null || tickAgeMin >= 20) && "Something must call POST /api/cron/tick every 1–5 minutes (GitHub Actions workflow, scripts/worker.mjs, or any cron) — otherwise syncing, reminders and summaries stop when nobody is using the app."}
                </div>
              </div>
            </li>
            {(dead?.n ?? 0) > 0 && (
              <li className="flex items-start gap-3 px-5 py-3">
                <CircleAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="text-xs text-stone-600">{dead!.n} background job(s) failed permanently after retries. Check agent_tasks.last_error in the database or the server logs.</div>
              </li>
            )}
          </ul>
        </Card>
      </div>
    </>
  );
}
