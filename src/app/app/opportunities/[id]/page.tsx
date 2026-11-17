import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, ShieldAlert } from "lucide-react";
import { DraftEditor, GenerateDraftButton } from "@/components/draft-panel";
import { OpportunityActions } from "@/components/opportunity-actions";
import { Badge, Card, CardHeader, CategoryBadge, ConfidenceMeter, Money, PriorityPill, cx, fmtDate, fmtDateTime, timeAgo } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { getOpportunity, gmailLink } from "@/lib/data";
import { WEIGHTS } from "@/lib/intel/score";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getOpportunity(auth.workspace.id, id);
  if (!data) notFound();
  const { opp, evidence, messages, financials, drafts, thread, priorityFactors } = data;
  const link = gmailLink(opp.provider, opp.accountEmail, opp.providerThreadId);
  const evidenceMsgIds = new Set(evidence.map((e) => e.messageId).filter(Boolean));
  const methodology = evidence.find((e) => e.kind === "methodology");
  const analysis = (thread?.analysis ?? {}) as { injectionSuspected?: boolean; notes?: string[] };

  return (
    <>
      <Link href="/app/opportunities" className="mb-5 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900">
        <ArrowLeft size={14} /> Opportunities
      </Link>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityPill score={opp.priorityScore} />
            <CategoryBadge category={opp.category} />
            <Badge>{opp.stage.replace(/_/g, " ")}</Badge>
            {opp.status !== "open" && <Badge tone="amber">{opp.status}{opp.resolution ? ` · ${opp.resolution}` : ""}{opp.snoozedUntil ? ` until ${fmtDate(opp.snoozedUntil)}` : ""}</Badge>}
          </div>
          <h1 className="font-display mt-3 text-3xl leading-tight">{opp.title}</h1>
          <p className="mt-2 max-w-3xl text-stone-600">{opp.summary}</p>
        </div>
        <div className="shrink-0 text-left lg:text-right">
          <Money cents={opp.amountCents} currency={opp.currency} className="font-display text-3xl" />
          <div className="text-xs text-stone-500">{opp.amountCents === null ? "No amount supported by evidence" : opp.amountSource === "user" ? "Amount corrected by you" : "Amount extracted from email"}</div>
        </div>
      </div>

      {analysis.injectionSuspected && (
        <div className="mb-5 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          This conversation contains instruction-like text aimed at automated systems (possible prompt injection). It was treated strictly as data and had no effect on the analysis.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">Recommended next action</div>
            <p className="mb-4 font-medium text-stone-900">{opp.recommendedAction}</p>
            <OpportunityActions id={opp.id} status={opp.status} amount={opp.amountCents} currency={opp.currency} stage={opp.stage} category={opp.category} />
          </Card>

          <Card>
            <CardHeader title="Evidence" hint="The exact text this finding is based on" />
            <ul className="divide-y divide-[var(--color-line)]">
              {evidence
                .filter((e) => e.kind !== "methodology")
                .map((e) => {
                  const m = messages.find((x) => x.id === e.messageId);
                  return (
                    <li key={e.id} className="px-5 py-4">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        <Badge tone="blue">{e.kind.replace(/_/g, " ")}</Badge>
                        {m && <span>{m.direction === "outbound" ? "You" : m.fromName ?? m.fromEmail} · {fmtDateTime(m.sentAt)}</span>}
                      </div>
                      <blockquote className="border-l-2 border-emerald-700/40 pl-3 text-sm italic text-stone-700">{e.excerpt}</blockquote>
                    </li>
                  );
                })}
            </ul>
            {methodology && (
              <div className="border-t border-[var(--color-line)] bg-stone-50/60 px-5 py-4 text-xs text-stone-600">
                <div className="mb-1 font-semibold text-stone-700">Methodology & assumptions</div>
                {methodology.excerpt}
                {Array.isArray((methodology.detail as { qaIssues?: string[] } | null)?.qaIssues) && ((methodology.detail as { qaIssues: string[] }).qaIssues.length > 0) && (
                  <div className="mt-2 text-amber-800">QA notes: {(methodology.detail as { qaIssues: string[] }).qaIssues.join("; ")}</div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Follow-up drafts" hint="Linked to this opportunity. You approve and send every email yourself." action={opp.status === "open" ? <GenerateDraftButton opportunityId={opp.id} label={drafts.length ? "New draft" : "Prepare draft"} /> : undefined} />
            <div className="space-y-4 p-5">
              {drafts.length === 0 ? <p className="text-sm text-stone-500">No drafts yet.</p> : drafts.map((d) => <DraftEditor key={d.id} d={{ ...d, updatedAt: d.updatedAt.toISOString() }} />)}
            </div>
          </Card>

          <Card>
            <CardHeader title="Conversation" hint={`${messages.length} message${messages.length === 1 ? "" : "s"}`} action={link ? <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900">Open in Gmail <ArrowUpRight size={12} /></a> : <span className="text-xs text-stone-400">Sample mailbox</span>} />
            <ol className="divide-y divide-[var(--color-line)]">
              {messages.map((m) => (
                <li key={m.id} className={cx("px-5 py-4", evidenceMsgIds.has(m.id) && "bg-emerald-50/40")}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-stone-800">
                      {m.direction === "outbound" ? "You" : m.fromName ?? m.fromEmail} <span className="font-normal text-stone-400">→ {m.toEmails.join(", ")}</span>
                    </span>
                    <span className="text-stone-500">{fmtDateTime(m.sentAt)} · {timeAgo(m.sentAt)}</span>
                  </div>
                  {m.bodyText ? <div className="prose-email text-sm text-stone-700">{m.bodyText}</div> : <div className="text-sm italic text-stone-400">{m.snippet || "(body not stored — filtered or past retention period)"}</div>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="p-5 text-sm">
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-stone-500">Contact</dt>
                <dd className="font-medium">{opp.contactName ?? "—"}</dd>
                <dd className="text-xs text-stone-500">{opp.contactEmail}</dd>
              </div>
              {opp.companyDomain && (
                <div>
                  <dt className="text-xs text-stone-500">Company (from email domain)</dt>
                  <dd>{opp.companyName ?? opp.companyDomain}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-stone-500">Last interaction</dt>
                <dd>{fmtDateTime(opp.lastInteractionAt)} <span className="text-stone-400">({timeAgo(opp.lastInteractionAt)})</span></dd>
              </div>
              {opp.dueDate && (
                <div>
                  <dt className="text-xs text-stone-500">Due date</dt>
                  <dd>{fmtDate(opp.dueDate)}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-stone-500">Confidence</dt>
                <dd><ConfidenceMeter value={opp.confidence} /></dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Conversation status</dt>
                <dd>{thread?.status?.replace(/_/g, " ") ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">First detected</dt>
                <dd>{fmtDate(data.detectedAt)}</dd>
              </div>
            </dl>
          </Card>

          {priorityFactors && (
            <Card className="p-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">Why this priority ({opp.priorityScore})</div>
              <ul className="space-y-2.5">
                {Object.entries(WEIGHTS).map(([k, w]) => {
                  const v = (priorityFactors as Record<string, number>)[k] ?? 0;
                  return (
                    <li key={k} className="text-xs">
                      <div className="mb-1 flex justify-between text-stone-600">
                        <span className="capitalize">{k === "time" ? "time sensitivity" : k === "intent" ? "commercial intent" : k}</span>
                        <span className="tabular">{Math.round(v * w)}/{w}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-stone-100">
                        <div className="h-full rounded-full bg-stone-700" style={{ width: `${v * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Extracted facts" hint="Deterministic extraction with source references" />
            {financials.length === 0 ? (
              <p className="px-5 py-4 text-sm text-stone-500">No financial facts found.</p>
            ) : (
              <ul className="divide-y divide-[var(--color-line)] text-sm">
                {financials.map((f) => (
                  <li key={f.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="capitalize text-stone-700">{f.kind.replace(/_/g, " ")}</span>
                      <Money cents={f.amountCents} currency={f.currency} className="font-medium" />
                    </div>
                    <div className="mt-0.5 text-xs text-stone-500">
                      “{f.rawText}”{f.reference ? ` · ref ${f.reference}` : ""}{f.dueDate ? ` · due ${fmtDate(f.dueDate)}` : ""} · {Math.round(f.confidence * 100)}%
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
