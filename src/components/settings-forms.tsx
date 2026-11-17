"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import type { WorkspaceSettings } from "@/db/schema";
import { api } from "@/lib/client";
import { Card, CardHeader, buttonClass } from "./ui";

type Prefs = { newOpportunity: boolean; overdueFollowUp: boolean; proposalInactivity: boolean; paymentReminder: boolean; dailySummary: boolean; emailNotifications: boolean; minPriority: number };
type KeyInfo = { provider: string; model: string | null };

const input = "mt-1 block w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm";

function useSaver() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (body: unknown, ok = "Saved") => {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/settings", "PATCH", body);
      setMsg(ok);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, save };
}

export function SettingsForms({ name, settings, prefs, keys, managedProviders, encryptionReady, emailReady }: { name: string; settings: WorkspaceSettings; prefs: Prefs; keys: KeyInfo[]; managedProviders: string[]; encryptionReady: boolean; emailReady: boolean }) {
  const router = useRouter();
  const general = useSaver();
  const privacy = useSaver();
  const notif = useSaver();
  const ai = useSaver();
  const [aiOn, setAiOn] = useState(!!settings.aiProcessingAllowed);
  const [delBusy, setDelBusy] = useState(false);
  const [delMsg, setDelMsg] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Workspace & detection" hint="Thresholds control when a conversation becomes an opportunity" />
        <form
          className="grid gap-4 p-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const n = (k: string) => Number(f.get(k));
            general.save({
              name: String(f.get("name")),
              settings: { monitoringDays: n("monitoringDays"), leadResponseHours: n("leadResponseHours"), proposalInactivityDays: n("proposalInactivityDays"), paymentGraceDays: n("paymentGraceDays"), followUpDays: n("followUpDays"), signature: String(f.get("signature") ?? "") },
            });
          }}
        >
          <label className="text-sm font-medium sm:col-span-2">Workspace name<input name="name" defaultValue={name} className={input} /></label>
          <label className="text-sm font-medium">Monitoring window (days)<input name="monitoringDays" type="number" min={7} max={365} defaultValue={settings.monitoringDays ?? 90} className={input} /></label>
          <label className="text-sm font-medium">Flag unanswered leads after (hours)<input name="leadResponseHours" type="number" min={1} max={168} defaultValue={settings.leadResponseHours ?? 4} className={input} /></label>
          <label className="text-sm font-medium">Proposal inactivity (days)<input name="proposalInactivityDays" type="number" min={1} max={60} defaultValue={settings.proposalInactivityDays ?? 3} className={input} /></label>
          <label className="text-sm font-medium">Payment grace period after due date (days)<input name="paymentGraceDays" type="number" min={0} max={60} defaultValue={settings.paymentGraceDays ?? 3} className={input} /></label>
          <label className="text-sm font-medium">Client question unanswered after (days)<input name="followUpDays" type="number" min={1} max={30} defaultValue={settings.followUpDays ?? 2} className={input} /></label>
          <label className="text-sm font-medium sm:col-span-2">Email signature for drafts<textarea name="signature" rows={3} defaultValue={settings.signature ?? ""} placeholder={"Best regards,\nAlex Morgan\nMorgan Studio"} className={input} /></label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <button disabled={general.busy} className={buttonClass("primary", "sm")}>Save</button>
            {general.msg && <span className="text-xs text-stone-600">{general.msg}. Changes apply at the next analysis run.</span>}
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Privacy & AI processing" />
        <div className="space-y-4 p-5">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={aiOn} onChange={(e) => setAiOn(e.target.checked)} className="mt-1 h-4 w-4 accent-emerald-700" />
            <span>
              <span className="block text-sm font-medium">Allow email content to be sent to external AI providers</span>
              <span className="mt-1 block text-sm text-stone-600">When on: excerpts of ambiguous conversations (classification), conversation context for drafts, and retrieved records for assistant answers may be sent to the providers below. Content is wrapped as untrusted data, and outputs are validated against your emails. Provider retention terms apply — some free tiers may use inputs for training; use your own paid key to avoid that.</span>
            </span>
          </label>
          <div className="flex items-center gap-3">
            <button disabled={privacy.busy} className={buttonClass("primary", "sm")} onClick={() => privacy.save({ settings: { aiProcessingAllowed: aiOn } })}>Save privacy setting</button>
            {privacy.msg && <span className="text-xs text-stone-600">{privacy.msg}</span>}
          </div>
          <form
            className="flex flex-wrap items-end gap-3 border-t border-[var(--color-line)] pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              privacy.save({ settings: { retentionDays: Number(f.get("retentionDays")) } });
            }}
          >
            <label className="text-sm font-medium">Delete stored message bodies after (days)<input name="retentionDays" type="number" min={30} max={730} defaultValue={settings.retentionDays ?? 180} className={input + " w-40"} /></label>
            <button disabled={privacy.busy} className={buttonClass("secondary", "sm")}>Save retention</button>
          </form>
        </div>
      </Card>

      <Card>
        <CardHeader title="AI providers" hint="Used only when AI processing is allowed. Your keys are encrypted at rest and take precedence over server-managed keys." />
        <div className="space-y-4 p-5">
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {["gemini", "groq", "mistral", "openai"].map((p) => {
              const k = keys.find((x) => x.provider === p);
              return (
                <li key={p} className="flex items-center justify-between rounded-lg border border-[var(--color-line)] px-3 py-2">
                  <span className="capitalize">{p}</span>
                  <span className="text-xs text-stone-500">
                    {k ? `your key${k.model ? ` · ${k.model}` : ""}` : managedProviders.includes(p) ? "server-managed key" : "not configured"}
                    {k && (
                      <button className="ml-2 text-red-700 hover:underline" onClick={() => ai.save({ aiKey: { provider: p, apiKey: null } }, "Key removed")}>remove</button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <form
            className="grid gap-3 sm:grid-cols-[140px_1fr_180px_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              ai.save({ aiKey: { provider: String(f.get("provider")), apiKey: String(f.get("apiKey")), model: String(f.get("model") || "") || undefined } }, "Key saved (encrypted)");
              e.currentTarget.reset();
            }}
          >
            <label className="text-xs font-medium">Provider<select name="provider" className={input}><option value="gemini">Gemini</option><option value="groq">Groq</option><option value="mistral">Mistral</option><option value="openai">OpenAI</option></select></label>
            <label className="text-xs font-medium">API key<input name="apiKey" type="password" autoComplete="off" required className={input} disabled={!encryptionReady} placeholder={encryptionReady ? "" : "Server encryption key not configured"} /></label>
            <label className="text-xs font-medium">Model (optional)<input name="model" className={input} placeholder="default per task" /></label>
            <button disabled={ai.busy || !encryptionReady} className={buttonClass("primary", "sm")}>Save key</button>
          </form>
          {ai.msg && <p className="text-xs text-stone-600">{ai.msg}</p>}
          <p className="text-xs text-stone-500">Usage is not unlimited: provider rate limits and quotas apply. Calls retry with backoff and fall back to the next provider; if all fail, deterministic results are used.</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Notifications" hint="Each unchanged opportunity notifies at most once. Emails contain titles and next actions only — never email content." />
        <form
          className="space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const b = (k: string) => f.get(k) === "on";
            notif.save({ notifications: { newOpportunity: b("newOpportunity"), overdueFollowUp: b("overdueFollowUp"), proposalInactivity: b("proposalInactivity"), paymentReminder: b("paymentReminder"), dailySummary: b("dailySummary"), emailNotifications: b("emailNotifications"), minPriority: Number(f.get("minPriority")) } });
          }}
        >
          {([
            ["newOpportunity", "New important opportunities"],
            ["proposalInactivity", "Proposal inactivity"],
            ["paymentReminder", "Payment follow-up reminders"],
            ["overdueFollowUp", "Snoozed / overdue follow-up reminders"],
            ["dailySummary", "Daily opportunity summary"],
          ] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" name={k} defaultChecked={prefs[k]} className="accent-emerald-700" /> {l}</label>
          ))}
          <label className="flex items-center gap-2 border-t border-[var(--color-line)] pt-3 text-sm">
            <input type="checkbox" name="emailNotifications" defaultChecked={prefs.emailNotifications} disabled={!emailReady} className="accent-emerald-700" /> Also send notifications by email (batched, at most every 15 minutes)
            {!emailReady && <span className="text-xs text-stone-400">— email delivery not configured on this server</span>}
          </label>
          <label className="block text-sm font-medium">Only notify at priority ≥<input name="minPriority" type="number" min={0} max={100} defaultValue={prefs.minPriority} className={input + " w-28"} /></label>
          <div className="flex items-center gap-3"><button disabled={notif.busy} className={buttonClass("primary", "sm")}>Save</button>{notif.msg && <span className="text-xs text-stone-600">{notif.msg}</span>}</div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Your data" />
        <div className="space-y-5 p-5">
          <div>
            <a href="/api/account" className={buttonClass("secondary", "sm")}><Download size={13} /> Export all data (JSON)</a>
            <p className="mt-1 text-xs text-stone-500">Includes conversations, findings, drafts, feedback and audit log. Credentials are never exported.</p>
          </div>
          <form
            className="rounded-lg border border-red-200 p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setDelBusy(true);
              setDelMsg(null);
              try {
                await api("/api/account", "DELETE", { confirm: String(f.get("confirm")) });
                router.push("/");
                router.refresh();
              } catch (err) {
                setDelMsg(err instanceof Error ? err.message : "Failed");
                setDelBusy(false);
              }
            }}
          >
            <div className="text-sm font-medium text-red-800">Delete account permanently</div>
            <p className="mt-1 text-xs text-stone-600">Revokes Google access and deletes every record — conversations, opportunities, drafts, settings. This cannot be undone.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input name="confirm" placeholder='Type "DELETE"' className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-sm" />
              <button disabled={delBusy} className={buttonClass("danger", "sm")}>{delBusy && <Loader2 size={12} className="animate-spin" />} Delete everything</button>
            </div>
            {delMsg && <p className="mt-2 text-xs text-red-700">{delMsg}</p>}
          </form>
        </div>
      </Card>
    </div>
  );
}
