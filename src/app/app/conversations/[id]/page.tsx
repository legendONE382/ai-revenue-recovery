import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, Card, CardHeader, CategoryBadge, fmtDateTime } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { getThread } from "@/lib/data";

export const dynamic = "force-dynamic";

type Sig = { signals?: { type: string; match: string }[]; amounts?: string[]; dates?: { raw: string; date: string }[]; invoiceRef?: string | null };

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getThread(auth.workspace.id, id);
  if (!data) notFound();
  const { thread, messages, opps } = data;
  const a = (thread.analysis ?? {}) as { stage?: string; notes?: string[]; ai?: { intent: string; reason: string; model: string; confidence: number } };
  return (
    <>
      <Link href="/app/conversations" className="mb-5 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900">
        <ArrowLeft size={14} /> Conversations
      </Link>
      <h1 className="font-display text-3xl">{thread.subject || "(no subject)"}</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone={thread.classification === "commercial" ? "green" : "neutral"}>{thread.classification ?? "pending"}</Badge>
        {thread.conversationStatus && <Badge>{thread.conversationStatus.replace(/_/g, " ")}</Badge>}
        {a.stage && thread.classification === "commercial" && <Badge tone="violet">stage: {a.stage.replace(/_/g, " ")}</Badge>}
      </div>
      {a.notes && a.notes.length > 0 && <p className="mt-3 text-sm text-amber-800">{a.notes.join(" ")}</p>}
      {a.ai && <p className="mt-2 text-xs text-stone-500">AI interpretation ({a.ai.model}): {a.ai.intent} · {Math.round(a.ai.confidence * 100)}% — {a.ai.reason}</p>}

      {opps.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {opps.map((o) => (
            <Link key={o.id} href={`/app/opportunities/${o.id}`} className="flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm hover:border-stone-300">
              <CategoryBadge category={o.category} /> {o.title} <span className="text-xs text-stone-400">({o.status})</span>
            </Link>
          ))}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title="Messages & extracted signals" hint="Signals are detected deterministically per message, direction-aware" />
        <ol className="divide-y divide-[var(--color-line)]">
          {messages.map((m) => {
            const s = (m.signals ?? {}) as Sig;
            return (
              <li key={m.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_260px]">
                <div>
                  <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs">
                    <span className="font-medium">{m.direction === "outbound" ? "You" : m.fromName ?? m.fromEmail} <span className="font-normal text-stone-400">{m.fromEmail}</span></span>
                    <span className="text-stone-500">{fmtDateTime(m.sentAt)}</span>
                  </div>
                  {m.bodyText ? <div className="prose-email text-sm text-stone-700">{m.bodyText}</div> : <div className="text-sm italic text-stone-400">{m.snippet || "(body not stored)"}</div>}
                </div>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-stone-500">Filter: </span>
                    <Badge tone={m.filterCategory === "candidate" ? "green" : "neutral"}>{m.filterCategory}</Badge> <Badge>{m.direction}</Badge>
                  </div>
                  {s.signals && s.signals.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {s.signals.map((g, i) => (
                        <span key={i} title={g.match}>
                          <Badge tone={g.type === "injection_suspected" ? "amber" : "blue"}>{g.type.replace(/_/g, " ")}</Badge>
                        </span>
                      ))}
                    </div>
                  )}
                  {s.amounts && s.amounts.length > 0 && <div className="text-stone-600">Amounts: {s.amounts.join(", ")}</div>}
                  {s.dates && s.dates.length > 0 && <div className="text-stone-600">Dates: {s.dates.map((d) => `“${d.raw}” → ${d.date.slice(0, 10)}`).join(", ")}</div>}
                  {s.invoiceRef && <div className="text-stone-600">Invoice ref: {s.invoiceRef}</div>}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </>
  );
}
