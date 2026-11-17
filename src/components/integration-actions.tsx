"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Unplug } from "lucide-react";
import { api } from "@/lib/client";
import { buttonClass } from "./ui";

export function AccountActions({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {active && (
          <button disabled={!!busy} className={buttonClass("secondary", "sm")} onClick={() => run("sync", () => api(`/api/integrations/${id}`, "POST", {}).then(() => setMsg("Sync queued — new messages will appear shortly.")))}>
            {busy === "sync" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sync now
          </button>
        )}
        {active && (
          <button disabled={!!busy} className={buttonClass("ghost", "sm")} onClick={() => run("full", () => api(`/api/integrations/${id}`, "POST", { full: true }).then(() => setMsg("Full resynchronisation queued.")))}>
            Full resync
          </button>
        )}
        <button disabled={!!busy} className={buttonClass("danger", "sm")} onClick={() => setConfirm(!confirm)}>
          <Unplug size={12} /> Disconnect
        </button>
      </div>
      {confirm && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <p className="mb-2">Disconnecting revokes our Google access and deletes stored tokens.</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={!!busy} className={buttonClass("danger", "sm")} onClick={() => run("purge", () => api(`/api/integrations/${id}`, "DELETE", { purge: true }))}>
              Disconnect & delete synced data
            </button>
            <button disabled={!!busy} className={buttonClass("secondary", "sm")} onClick={() => run("keep", () => api(`/api/integrations/${id}`, "DELETE", { purge: false }))}>
              Disconnect, keep history
            </button>
          </div>
        </div>
      )}
      {msg && <p className="text-xs text-stone-600">{msg}</p>}
    </div>
  );
}

export function ConnectDemoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <button
        disabled={busy}
        className={buttonClass("secondary")}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api<{ synced: number; analysed: number }>("/api/integrations/demo", "POST", {});
            setMsg(`Synced ${r.synced} messages, analysed ${r.analysed} conversations.`);
            router.refresh();
          } catch (e) {
            setMsg(e instanceof Error ? e.message : "Failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <Loader2 size={14} className="animate-spin" />} Connect sample inbox
      </button>
      {msg && <p className="mt-2 text-xs text-stone-600">{msg}</p>}
    </div>
  );
}

/** Polls sync status while any account is mid-sync or jobs are pending. */
export function SyncPoller({ active }: { active: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<{ pendingJobs: number; threads: { total: number; analysed: number } } | null>(null);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      try {
        const s = await api<{ pendingJobs: number; threads: { total: number; analysed: number } }>("/api/status", "GET");
        setStatus(s);
        if (s.pendingJobs === 0) {
          clearInterval(t);
          router.refresh();
        }
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [active, router]);
  if (!active || !status) return null;
  const pct = status.threads.total ? Math.round((status.threads.analysed / status.threads.total) * 100) : 0;
  return (
    <div className="mb-6 rounded-xl border border-[var(--color-line)] bg-white p-4 text-sm">
      <div className="mb-2 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Synchronising and analysing… {status.threads.analysed}/{status.threads.total} conversations · {status.pendingJobs} jobs queued</div>
      <div className="h-1.5 rounded-full bg-stone-100"><div className="h-full rounded-full bg-[var(--color-brand)] transition-all" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
