"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BellOff, Check, Pencil, RotateCcw, X } from "lucide-react";
import { api } from "@/lib/client";
import { buttonClass } from "./ui";

type Props = { id: string; status: string; amount: number | null; currency: string | null; stage: string; category: string };

export function OpportunityActions(p: Props) {
  const router = useRouter();
  const [panel, setPanel] = useState<null | "dismiss" | "resolve" | "snooze" | "correct">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/opportunities/${p.id}`, "PATCH", body);
      setPanel(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-lg border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-sm";
  if (p.status !== "open" && p.status !== "snoozed") {
    return (
      <button disabled={busy} className={buttonClass("secondary", "sm")} onClick={() => act({ action: "reopen" })}>
        <RotateCcw size={13} /> Reopen
      </button>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass("primary", "sm")} onClick={() => setPanel(panel === "resolve" ? null : "resolve")}>
          <Check size={13} /> Mark resolved
        </button>
        <button className={buttonClass("secondary", "sm")} onClick={() => setPanel(panel === "snooze" ? null : "snooze")}>
          <BellOff size={13} /> Snooze
        </button>
        <button className={buttonClass("secondary", "sm")} onClick={() => setPanel(panel === "correct" ? null : "correct")}>
          <Pencil size={13} /> Correct details
        </button>
        <button className={buttonClass("ghost", "sm")} onClick={() => setPanel(panel === "dismiss" ? null : "dismiss")}>
          <X size={13} /> Not an opportunity
        </button>
      </div>

      {panel === "resolve" && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-lg bg-stone-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const resolution = String(f.get("resolution"));
            const amt = f.get("amount") ? Number(f.get("amount")) : undefined;
            act({ action: "resolve", resolution, ...(resolution === "paid" && amt !== undefined ? { recoveredAmount: amt } : {}) });
          }}
        >
          <label className="text-xs text-stone-600">
            Outcome
            <select name="resolution" className={input + " block"} defaultValue={p.category === "payment_followup" ? "paid" : p.category === "proposal_awaiting" ? "won" : "handled"}>
              <option value="handled">Handled / replied</option>
              <option value="won">Won the work</option>
              <option value="paid">Payment received</option>
              <option value="lost">Lost</option>
            </select>
          </label>
          <label className="text-xs text-stone-600">
            Amount received (if paid)
            <input name="amount" type="number" step="0.01" min="0" defaultValue={p.amount !== null ? p.amount / 100 : ""} className={input + " block w-36"} />
          </label>
          <button disabled={busy} className={buttonClass("primary", "sm")}>Save</button>
          <p className="w-full text-[11px] text-stone-500">Only &ldquo;Payment received&rdquo; counts toward confirmed revenue recovered.</p>
        </form>
      )}

      {panel === "snooze" && (
        <div className="flex flex-wrap gap-2 rounded-lg bg-stone-50 p-3">
          {[
            ["Tomorrow", 1],
            ["In 3 days", 3],
            ["Next week", 7],
            ["In 2 weeks", 14],
          ].map(([label, d]) => (
            <button key={label} disabled={busy} className={buttonClass("secondary", "sm")} onClick={() => act({ action: "snooze", until: new Date(Date.now() + Number(d) * 86_400_000).toISOString() })}>
              {label}
            </button>
          ))}
          <p className="w-full text-[11px] text-stone-500">You&apos;ll get a reminder when it&apos;s due.</p>
        </div>
      )}

      {panel === "correct" && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-lg bg-stone-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const raw = String(f.get("amount") ?? "");
            act({ action: "correct", amount: raw === "" ? null : Number(raw), currency: String(f.get("currency")), stage: String(f.get("stage")) });
          }}
        >
          <label className="text-xs text-stone-600">
            Amount
            <input name="amount" type="number" step="0.01" min="0" defaultValue={p.amount !== null ? p.amount / 100 : ""} className={input + " block w-32"} />
          </label>
          <label className="text-xs text-stone-600">
            Currency
            <select name="currency" defaultValue={p.currency ?? "USD"} className={input + " block"}>
              {["USD", "GBP", "EUR", "AUD", "CAD", "NZD", "CHF", "SGD", "INR"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-stone-600">
            Stage
            <select name="stage" defaultValue={p.stage} className={input + " block"}>
              {["new", "contacted", "proposal_sent", "negotiating", "invoiced", "won", "lost", "dormant", "paid"].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </label>
          <button disabled={busy} className={buttonClass("primary", "sm")}>Save correction</button>
          <p className="w-full text-[11px] text-stone-500">Your corrections are preserved through future re-analysis of this conversation.</p>
        </form>
      )}

      {panel === "dismiss" && (
        <form
          className="space-y-2 rounded-lg bg-stone-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            act({ action: "dismiss", reason: String(f.get("reason") || "") || undefined, suppressSender: f.get("suppress") === "on" });
          }}
        >
          <input name="reason" placeholder="Why? (optional — e.g. personal email, already handled by phone)" className={input + " w-full"} />
          <label className="flex items-center gap-2 text-xs text-stone-600">
            <input type="checkbox" name="suppress" className="accent-emerald-700" /> Never flag conversations with this contact again
          </label>
          <button disabled={busy} className={buttonClass("danger", "sm")}>Dismiss as false positive</button>
          <p className="text-[11px] text-stone-500">It won&apos;t come back unless new messages arrive in this conversation.</p>
        </form>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
