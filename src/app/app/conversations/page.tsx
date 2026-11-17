import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, cx, timeAgo } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { listThreads } from "@/lib/data";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; tone: "red" | "neutral" | "green" | "amber" }> = {
  awaiting_business: { label: "Awaiting you", tone: "red" },
  awaiting_contact: { label: "Awaiting them", tone: "neutral" },
  closed: { label: "Closed", tone: "green" },
  no_action: { label: "No action", tone: "neutral" },
};

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const filter = sp.filter ?? "commercial";
  const rows = await listThreads(auth.workspace.id, { filter, q: sp.q?.slice(0, 100) });
  const tabs = [
    ["commercial", "Commercial"],
    ["attention", "Awaiting your reply"],
    ["all", "All analysed"],
    ["filtered", "Filtered out"],
  ];
  return (
    <>
      <PageHeader title="Conversations" subtitle="Threads as the intelligence engine understands them. Newsletters, notifications and spam are filtered before any analysis." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map(([k, l]) => (
            <Link key={k} href={`/app/conversations?filter=${k}`} className={cx("rounded-lg border px-3 py-1.5 text-xs", filter === k ? "border-stone-900 bg-stone-900 text-white" : "border-[var(--color-line)] bg-white text-stone-600")}>
              {l}
            </Link>
          ))}
        </div>
        <form action="/app/conversations" className="flex gap-2">
          <input type="hidden" name="filter" value={filter} />
          <input name="q" defaultValue={sp.q} placeholder="Search subject…" className="w-52 rounded-lg border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-xs" />
        </form>
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No conversations" body="Nothing in this view yet." />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {rows.map((t) => {
              const st = STATUS_LABEL[t.status ?? ""];
              const a = (t.analysis ?? {}) as { stage?: string; injectionSuspected?: boolean };
              return (
                <li key={t.id}>
                  <Link href={`/app/conversations/${t.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-stone-50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-stone-900">{t.subject || "(no subject)"}</div>
                      <div className="truncate text-xs text-stone-500">
                        {t.contactName ?? t.contactEmail ?? "—"} · {t.messageCount} msg{t.messageCount === 1 ? "" : "s"}
                        {a.stage && t.classification === "commercial" ? ` · stage: ${a.stage.replace(/_/g, " ")}` : ""}
                      </div>
                    </div>
                    <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
                      {a.injectionSuspected && <Badge tone="amber">injection attempt</Badge>}
                      {t.openOpps > 0 && <Badge tone="violet">{t.openOpps} open</Badge>}
                      <Badge tone={t.classification === "commercial" ? "green" : "neutral"}>{t.classification ?? "pending"}</Badge>
                      {st && t.classification === "commercial" && <Badge tone={st.tone}>{st.label}</Badge>}
                    </div>
                    <span className="w-16 text-right text-xs text-stone-500">{timeAgo(t.lastMessageAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
