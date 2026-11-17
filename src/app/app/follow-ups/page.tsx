import Link from "next/link";
import { DraftEditor, GenerateDraftButton } from "@/components/draft-panel";
import { Card, CardHeader, CategoryBadge, EmptyState, PageHeader, PriorityPill, timeAgo } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { listDrafts, listOpportunities } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function FollowUpsPage() {
  const auth = await requireAuth();
  const [drafts, open] = await Promise.all([listDrafts(auth.workspace.id), listOpportunities(auth.workspace.id, { status: "open", limit: 50 })]);
  const draftedOpps = new Set(drafts.filter((d) => d.draft.status !== "discarded").map((d) => d.draft.opportunityId));
  const needing = open.filter((o) => !draftedOpps.has(o.id)).slice(0, 10);
  const active = drafts.filter((d) => d.draft.status === "draft" || d.draft.status === "gmail_draft_created");
  const done = drafts.filter((d) => d.draft.status === "sent_confirmed" || d.draft.status === "discarded");

  return (
    <>
      <PageHeader title="Follow-ups" subtitle="Prepare contextual drafts, edit them, and create them in Gmail. You always send them yourself." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <h2 className="text-sm font-semibold text-stone-700">Drafts in progress ({active.length})</h2>
          {active.length === 0 ? (
            <Card>
              <EmptyState title="No drafts yet" body="Pick an opportunity on the right to prepare a follow-up." />
            </Card>
          ) : (
            active.map(({ draft, oppTitle, oppCategory }) => (
              <div key={draft.id}>
                <Link href={`/app/opportunities/${draft.opportunityId}`} className="mb-2 flex items-center gap-2 text-sm hover:underline">
                  <CategoryBadge category={oppCategory} /> {oppTitle}
                </Link>
                <DraftEditor compact d={{ ...draft, updatedAt: draft.updatedAt.toISOString() }} />
              </div>
            ))
          )}
          {done.length > 0 && (
            <Card>
              <CardHeader title="History" />
              <ul className="divide-y divide-[var(--color-line)] text-sm">
                {done.map(({ draft, oppTitle }) => (
                  <li key={draft.id} className="flex justify-between gap-3 px-5 py-2.5">
                    <Link href={`/app/opportunities/${draft.opportunityId}`} className="truncate hover:underline">{draft.subject} <span className="text-stone-400">— {oppTitle}</span></Link>
                    <span className="shrink-0 text-xs text-stone-500">{draft.status === "sent_confirmed" ? "sent (confirmed by you)" : "discarded"} · {timeAgo(draft.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <Card className="h-fit">
          <CardHeader title="Needs a follow-up" hint="Open opportunities without a draft" />
          {needing.length === 0 ? (
            <p className="px-5 py-6 text-sm text-stone-500">All open opportunities have drafts.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-line)]">
              {needing.map((o) => (
                <li key={o.id} className="space-y-2 px-5 py-3">
                  <div className="flex items-start gap-2">
                    <PriorityPill score={o.priorityScore} />
                    <Link href={`/app/opportunities/${o.id}`} className="text-sm font-medium leading-snug hover:underline">{o.title}</Link>
                  </div>
                  <GenerateDraftButton opportunityId={o.id} label="Prepare draft" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
