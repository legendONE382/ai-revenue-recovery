"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, buttonClass } from "./ui";

export type DraftView = { id: string; kind: string; toEmail: string; subject: string; body: string; status: string; generatedBy: string; updatedAt: string; providerDraftId: string | null };

const STATUS_TONE: Record<string, "neutral" | "green" | "blue" | "amber"> = { draft: "neutral", gmail_draft_created: "blue", sent_confirmed: "green", discarded: "amber" };

export function DraftEditor({ d, compact }: { d: DraftView; compact?: boolean }) {
  const router = useRouter();
  const [subject, setSubject] = useState(d.subject);
  const [body, setBody] = useState(d.body);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = subject !== d.subject || body !== d.body;
  const editable = d.status === "draft" || d.status === "gmail_draft_created";

  async function run(label: string, fn: () => Promise<void>) {
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
    <div className="rounded-xl border border-[var(--color-line)] bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] px-4 py-2.5 text-xs">
        <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{d.status.replace(/_/g, " ")}</Badge>
        <span className="text-stone-500">{d.kind.replace(/_/g, " ")}</span>
        <span className="text-stone-400">·</span>
        <span className="text-stone-500">to {d.toEmail}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-stone-400" title={d.generatedBy}>
          {d.generatedBy.startsWith("ai:") && <Sparkles size={11} />} {d.generatedBy.startsWith("ai:") ? "AI-written" : "Template"}
        </span>
      </div>
      <div className="space-y-2 p-4">
        <input value={subject} disabled={!editable} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium disabled:bg-stone-50" />
        <textarea value={body} disabled={!editable} onChange={(e) => setBody(e.target.value)} rows={compact ? 7 : 10} className="w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm leading-relaxed disabled:bg-stone-50" />
        {editable && (
          <div className="flex flex-wrap gap-2">
            {dirty && (
              <button disabled={!!busy} className={buttonClass("secondary", "sm")} onClick={() => run("save", () => api(`/api/drafts/${d.id}`, "PATCH", { subject, body }).then(() => undefined))}>
                {busy === "save" && <Loader2 size={12} className="animate-spin" />} Save edits
              </button>
            )}
            <button
              disabled={!!busy || dirty}
              title={dirty ? "Save your edits first" : ""}
              className={buttonClass("primary", "sm")}
              onClick={() =>
                run("gmail", async () => {
                  const r = await api<{ demo: boolean; openUrl: string | null }>(`/api/drafts/${d.id}`, "POST", {});
                  setMsg(r.demo ? "Demo mailbox: draft recorded (no real Gmail draft is created in demo mode)." : "Draft created in Gmail. Review and send it from Gmail.");
                  if (r.openUrl) window.open(r.openUrl, "_blank", "noopener");
                })
              }
            >
              {busy === "gmail" ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />} {d.status === "gmail_draft_created" ? "Create again in Gmail" : "Create Gmail draft"}
            </button>
            <button disabled={!!busy} className={buttonClass("secondary", "sm")} onClick={() => run("sent", () => api(`/api/drafts/${d.id}`, "PATCH", { status: "sent_confirmed" }).then(() => undefined))}>
              I&apos;ve sent it
            </button>
            <button disabled={!!busy} className={buttonClass("ghost", "sm")} onClick={() => run("discard", () => api(`/api/drafts/${d.id}`, "PATCH", { status: "discarded" }).then(() => undefined))}>
              Discard
            </button>
          </div>
        )}
        {msg && <p className="text-xs text-stone-600">{msg}</p>}
        <p className="text-[11px] text-stone-400">Nothing is sent automatically. Review carefully — drafts reference only facts found in the conversation.</p>
      </div>
    </div>
  );
}

export function GenerateDraftButton({ opportunityId, label = "Prepare follow-up draft" }: { opportunityId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button
        disabled={busy}
        className={buttonClass("primary", "sm")}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            await api(`/api/opportunities/${opportunityId}/drafts`, "POST", {});
            router.refresh();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {label}
      </button>
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
    </div>
  );
}
