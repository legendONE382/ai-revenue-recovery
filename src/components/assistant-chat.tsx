"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Loader2, Sparkles, User } from "lucide-react";
import { api } from "@/lib/client";
import { cx } from "./ui";

type Item = { id: string; title: string; category: string; amount: string | null; priority: number; lastInteraction: string | null; href: string };
type Msg = { role: "user" | "assistant"; text: string; items?: Item[]; usedAI?: string | null; draftLink?: string };

const SUGGESTIONS = [
  "What should I prioritise today?",
  "Which potential clients need follow-ups?",
  "Which proposals have gone unanswered?",
  "Show me conversations involving payments",
  "Summarise my outstanding commercial opportunities",
];

export function AssistantChat({ aiEnabled }: { aiEnabled: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const r = await api<{ answer: string; items: Item[]; usedAI: string | null; action?: { type: string; opportunityId: string } }>("/api/assistant", "POST", { question: q });
      setMsgs((m) => [...m, { role: "assistant", text: r.answer, items: r.items, usedAI: r.usedAI, draftLink: r.action?.type === "draft_created" ? `/app/opportunities/${r.action.opportunityId}` : undefined }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: e instanceof Error ? e.message : "Something went wrong." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col rounded-xl border border-[var(--color-line)] bg-white">
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {msgs.length === 0 && (
          <div className="mx-auto max-w-lg pt-8 text-center">
            <Bot className="mx-auto text-[var(--color-brand)]" size={28} />
            <h2 className="font-display mt-3 text-2xl">Ask about your opportunities</h2>
            <p className="mt-1 text-sm text-stone-500">Answers come from your actual conversations and findings. The assistant can prepare drafts but never sends email.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cx("flex gap-3", m.role === "user" && "flex-row-reverse")}>
            <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full", m.role === "user" ? "bg-stone-200" : "bg-[var(--color-brand-soft)] text-[var(--color-brand)]")}>{m.role === "user" ? <User size={14} /> : <Bot size={14} />}</span>
            <div className={cx("max-w-[85%] rounded-xl px-4 py-3 text-sm", m.role === "user" ? "bg-stone-900 text-white" : "bg-stone-50 text-stone-800")}>
              <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
              {m.items && m.items.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {m.items.map((it) => (
                    <li key={it.id}>
                      <Link href={it.href} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-xs hover:border-stone-300">
                        <span className="truncate font-medium">{it.title}</span>
                        <span className="shrink-0 text-stone-500">{it.amount ?? ""} · P{it.priority}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {m.draftLink && (
                <Link href={m.draftLink} className="mt-3 inline-block text-xs font-medium text-[var(--color-brand)] underline">
                  Review & edit the draft →
                </Link>
              )}
              {m.role === "assistant" && <div className="mt-2 flex items-center gap-1 text-[10px] text-stone-400">{m.usedAI ? <><Sparkles size={10} /> phrased by {m.usedAI}, grounded in your data</> : "answered directly from your data (no external AI)"}</div>}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Loader2 size={14} className="animate-spin" /> Looking through your conversations…
          </div>
        )}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="border-t border-[var(--color-line)] p-3"
      >
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] px-3 py-1.5 focus-within:border-stone-400">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Prepare a follow-up for Priya" className="flex-1 bg-transparent py-1.5 text-sm outline-none" maxLength={1000} />
          <button disabled={busy || !input.trim()} className="grid h-8 w-8 place-items-center rounded-lg bg-stone-900 text-white disabled:opacity-40" aria-label="Send">
            <ArrowUp size={15} />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-stone-400">{aiEnabled ? "AI phrasing enabled — only retrieved records are shared with your configured provider." : "AI processing is off — answers are generated deterministically from your data."}</p>
      </form>
    </div>
  );
}
