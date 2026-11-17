import Link from "next/link";
import { Search } from "lucide-react";
import { OpportunityCard } from "@/components/opportunity-card";
import { CATEGORY_META, Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { listOpportunities } from "@/lib/data";

export const dynamic = "force-dynamic";

type SP = { status?: string; category?: string; q?: string; sort?: string };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const status = sp.status ?? "open";
  const category = sp.category ?? "all";
  const sort = (["priority", "recent", "amount"].includes(sp.sort ?? "") ? sp.sort : "priority") as "priority" | "recent" | "amount";
  const rows = await listOpportunities(auth.workspace.id, { status, category, q: sp.q?.slice(0, 100), sort });
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams({ status, category, sort, ...(sp.q ? { q: sp.q } : {}), ...patch } as Record<string, string>);
    return `/app/opportunities?${p}`;
  };

  return (
    <>
      <PageHeader title="Opportunities" subtitle="Every finding is backed by evidence from your conversations. Dismiss false positives to teach the system." />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {[["all", "All categories"], ...Object.entries(CATEGORY_META).map(([k, v]) => [k, v.short])].map(([k, label]) => (
            <Link key={k} href={qs({ category: k })} className={cx("rounded-lg border px-3 py-1.5 text-xs", category === k ? "border-stone-900 bg-stone-900 text-white" : "border-[var(--color-line)] bg-white text-stone-600 hover:border-stone-300")}>
              {label}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-center gap-2" action="/app/opportunities">
          <input type="hidden" name="category" value={category} />
          <select name="status" defaultValue={status} className="rounded-lg border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-xs">
            <option value="open">Open</option>
            <option value="snoozed">Snoozed</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
            <option value="all">All statuses</option>
          </select>
          <select name="sort" defaultValue={sort} className="rounded-lg border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-xs">
            <option value="priority">Priority</option>
            <option value="recent">Most recent</option>
            <option value="amount">Amount</option>
          </select>
          <label className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-stone-400" />
            <input name="q" defaultValue={sp.q} placeholder="Search contact, subject…" className="w-52 rounded-lg border border-[var(--color-line)] bg-white py-1.5 pl-7 pr-2.5 text-xs" />
          </label>
          <button className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs text-white">Apply</button>
        </form>
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No opportunities match" body="Try a different filter, or check Integrations to make sure your mailbox is syncing." />
        ) : (
          <div className="divide-y divide-[var(--color-line)]">{rows.map((o) => <OpportunityCard key={o.id} o={o} />)}</div>
        )}
      </Card>
      <p className="mt-3 text-xs text-stone-400">{rows.length} result{rows.length === 1 ? "" : "s"}</p>
    </>
  );
}
