"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Eye, FileEdit, Loader2, Lock, ShieldAlert } from "lucide-react";
import { api } from "@/lib/client";
import { buttonClass, cx } from "./ui";

export function OnboardingFlow({ googleReady, demoFirst }: { googleReady: boolean; demoFirst: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [days, setDays] = useState(90);
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function savePrefs() {
    await api("/api/settings", "PATCH", { settings: { monitoringDays: days, aiProcessingAllowed: ai, onboardingComplete: true } });
  }

  async function connectGmail() {
    setBusy("gmail");
    try {
      await savePrefs();
      window.location.href = "/api/integrations/google/start";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(null);
    }
  }

  async function connectDemo() {
    setBusy("demo");
    setError(null);
    try {
      await savePrefs();
      setProgress(["Preferences saved", "Connecting sample mailbox…"]);
      const r = await api<{ synced: number; analysed: number }>("/api/integrations/demo", "POST", {});
      setProgress((p) => [...p, `Synchronised ${r.synced} messages`, `Analysed ${r.analysed} conversations`, "Opportunities ready"]);
      setTimeout(() => router.push("/app"), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(null);
    }
  }

  const steps = ["Permissions", "Preferences", "Connect"];
  return (
    <div>
      <ol className="mb-8 flex items-center gap-2 text-xs">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cx("grid h-6 w-6 place-items-center rounded-full border text-[11px] font-semibold", i < step ? "border-emerald-700 bg-emerald-700 text-white" : i === step ? "border-stone-900 text-stone-900" : "border-stone-300 text-stone-400")}>
              {i < step ? <Check size={12} /> : i + 1}
            </span>
            <span className={i === step ? "font-medium text-stone-900" : "text-stone-500"}>{s}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-8 bg-stone-300" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div>
          <h2 className="font-display text-2xl">What we&apos;ll ask Google for — and why</h2>
          <ul className="mt-5 space-y-4">
            <li className="flex gap-3">
              <Eye className="mt-0.5 shrink-0 text-stone-600" size={18} />
              <div>
                <div className="font-medium">Read your email (gmail.readonly)</div>
                <p className="text-sm text-stone-600">Needed to understand whole conversations — enquiries, proposals, invoices and replies. Google classifies this as a <em>restricted</em> scope.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <FileEdit className="mt-0.5 shrink-0 text-stone-600" size={18} />
              <div>
                <div className="font-medium">Create drafts (gmail.compose)</div>
                <p className="text-sm text-stone-600">Used only when you click “Create Gmail draft”. We never send email for you.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <Lock className="mt-0.5 shrink-0 text-stone-600" size={18} />
              <div>
                <div className="font-medium">Your credentials stay server-side</div>
                <p className="text-sm text-stone-600">Tokens are encrypted (AES-256-GCM). Newsletter and notification bodies are never stored. Disconnect or delete everything at any time.</p>
              </div>
            </li>
          </ul>
          {!googleReady && (
            <p className="mt-6 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              Gmail OAuth isn&apos;t configured on this server yet (or the app is awaiting Google verification). You can explore the full product with the sample inbox.
            </p>
          )}
          <button className={buttonClass("primary") + " mt-7"} onClick={() => setStep(1)}>
            Continue
          </button>
        </div>
      )}

      {step === 1 && (
        <div>
          <h2 className="font-display text-2xl">Monitoring preferences</h2>
          <label className="mt-6 block text-sm font-medium">
            How far back should we look?
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-1 block w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm">
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days (recommended)</option>
              <option value={180}>Last 6 months</option>
              <option value={365}>Last 12 months</option>
            </select>
          </label>
          <div className="mt-6 rounded-xl border border-[var(--color-line)] p-4">
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} className="mt-1 h-4 w-4 accent-emerald-700" />
              <span>
                <span className="block text-sm font-medium">Allow AI-assisted analysis with external providers</span>
                <span className="mt-1 block text-sm text-stone-600">
                  Off by default. Detection works without it using deterministic rules. If enabled, excerpts of <em>ambiguous</em> conversations, draft context and assistant questions may be sent to the AI provider(s) configured in Settings, subject to their data-retention terms. You can change this any time.
                </span>
              </span>
            </label>
          </div>
          <div className="mt-7 flex gap-2">
            <button className={buttonClass("ghost")} onClick={() => setStep(0)}>
              Back
            </button>
            <button className={buttonClass("primary")} onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="font-display text-2xl">Connect a mailbox</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button disabled={!googleReady || !!busy} onClick={connectGmail} className={cx("rounded-xl border p-4 text-left transition", googleReady ? "border-stone-900 hover:bg-stone-50" : "border-[var(--color-line)] opacity-60", demoFirst && "order-2")}>
              <div className="font-medium">Connect Gmail</div>
              <div className="mt-1 text-sm text-stone-600">{googleReady ? "Sign in with Google and start the initial sync." : "Not available until Google OAuth is configured."}</div>
              {busy === "gmail" && <Loader2 className="mt-2 animate-spin" size={16} />}
            </button>
            <button disabled={!!busy} onClick={connectDemo} className="rounded-xl border border-[var(--color-line)] p-4 text-left transition hover:bg-stone-50">
              <div className="font-medium">Use a sample inbox</div>
              <div className="mt-1 text-sm text-stone-600">19 realistic conversations — including tricky false-positive cases — run through the real pipeline.</div>
              {busy === "demo" && <Loader2 className="mt-2 animate-spin" size={16} />}
            </button>
          </div>
          {progress.length > 0 && (
            <ul className="mt-6 space-y-1.5 text-sm">
              {progress.map((p) => (
                <li key={p} className="flex items-center gap-2 text-stone-700">
                  <Check size={14} className="text-emerald-700" /> {p}
                </li>
              ))}
            </ul>
          )}
          {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className={buttonClass("ghost") + " mt-6"} disabled={!!busy} onClick={() => setStep(1)}>
            Back
          </button>
        </div>
      )}
    </div>
  );
}
