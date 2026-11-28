import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { OpportunityCard } from "@/components/opportunity-card";
import { NotificationsPanel } from "@/components/notifications-panel";
import { Card, CardHeader, EmptyState, LinkButton, Money, MoneyByCurrency, PageHeader, Stat, fmtDate } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { analytics, communicationBreakdown, getBusinessProfile, listAccounts, listOpportunities, mailboxIntelligence, overview, recentNotifications } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const auth = await requireAuth();
  const ws = auth.workspace.id;
  const [stats, top, recovered, accounts, notes, a, bp, mi, cb] = await Promise.all([
    overview(ws),
    listOpportunities(ws, { status: "open", limit: 6 }),
    listOpportunities(ws, { status: "resolved", sort: "recent", limit: 5 }),
    listAccounts(ws),
    recentNotifications(ws, 15),
    analytics(ws),
    getBusinessProfile(ws),
    mailboxIntelligence(ws),
    communicationBreakdown(ws),
  ]);
  const problem = accounts.find((x) => x.account.status === "revoked" || x.account.status === "error");
  const hour = new Date().getHours();

  return (
    <>
      <PageHeader
        title={`Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}${auth.user.name ? `, ${auth.user.name.split(" ")[0]}` : ""}`}
        subtitle={stats.activeOpportunities ? `${stats.activeOpportunities} open opportunities across your commercial conversations. Highest priority first.` : "Your commercial conversations at a glance."}
        actions={<LinkButton href="/app/assistant">Ask the assistant</LinkButton>}
      />

      {accounts.length === 0 && (
        <Card className="mb-6 p-6">
          <EmptyState title="No mailbox connected" body="Connect Gmail (or the sample inbox) to start finding opportunities." action={<LinkButton variant="primary" href="/app/integrations">Connect a mailbox</LinkButton>} />
        </Card>
      )}
      {problem && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={16} />
          <span className="flex-1">
            {problem.account.email}: {problem.account.statusMessage ?? "connection problem"}. Monitoring is paused for this mailbox.
          </span>
          <Link href="/app/integrations" className="font-medium underline">
            Reconnect
          </Link>
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Business snapshot</h2>
          {bp.profile ? (
            <div className="mt-3 space-y-1 text-sm">
              <div className="font-medium">{bp.profile.businessName ?? "Unnamed business"}</div>
              <div className="text-stone-600">{[bp.profile.businessType, bp.profile.industry].filter(Boolean).join(" · ")}</div>
              {bp.profile.description && <p className="text-stone-600">{bp.profile.description}</p>}
              {bp.offerings.length > 0 && <div className="text-xs text-stone-500">Offerings: {bp.offerings.map((o) => o.name).join(", ")}</div>}
              <Link href="/app/settings/business-profile" className="mt-2 inline-block text-xs text-emerald-700 underline">Edit business profile</Link>
            </div>
          ) : (
            <div className="mt-3 text-sm text-stone-600">
              No business profile yet. <Link href="/app/settings" className="text-emerald-700 underline">Complete your profile</Link>.
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Mailbox intelligence</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-stone-500 text-xs">Emails reviewed</dt><dd className="font-medium">{mi.emailsReviewed}</dd></div>
            <div><dt className="text-stone-500 text-xs">Conversations</dt><dd className="font-medium">{mi.conversations}</dd></div>
            <div><dt className="text-stone-500 text-xs">Business-related</dt><dd className="font-medium">{mi.businessRelated}</dd></div>
            <div><dt className="text-stone-500 text-xs">Contacts</dt><dd className="font-medium">{mi.contacts}</dd></div>
            <div><dt className="text-stone-500 text-xs">Need attention</dt><dd className="font-medium">{mi.needsAttention}</dd></div>
          </dl>
        </Card>
      </div>

      {cb.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="text-sm font-semibold">Communication overview</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {cb.map((c) => (
              <li key={c.category} className="flex justify-between"><span className="text-stone-600">{c.category}</span><span className="font-medium">{c.n}</span></li>
            ))}
          </ul>
        </Card>
      )}

      {bp.insights.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="text-sm font-semibold">Business insights</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {bp.insights.slice(0, 5).map((i) => (
              <li key={i.id}><div className="font-medium">{i.title}</div><div className="text-stone-600">{i.description}</div></li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Active" value={stats.activeOpportunities} href="/app/opportunities" />
        <Stat label="Need attention" value={stats.attention} hint="awaiting your reply" href="/app/conversations?filter=attention" />
        <Stat label="Leads" value={stats.leads} hint="unanswered" href="/app/opportunities?category=unanswered_lead" />
        <Stat label="Proposals" value={stats.proposals} hint="awaiting response" href="/app/opportunities?category=proposal_awaiting" />
        <Stat label="Payments" value={stats.payments} hint="to follow up" href="/app/opportunities?category=payment_followup" />
        <Stat label="Client follow-ups" value={stats.clientFollowups} href="/app/opportunities?category=client_followup" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="Top priorities" hint="Ranked by money, time sensitivity, intent, activity and confidence" action={<Link href="/app/opportunities" className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900">All <ArrowRight size={12} /></Link>} />
          {top.length === 0 ? (
            <EmptyState title="Nothing needs attention" body="When a lead, proposal or payment needs action, it will appear here." />
          ) : (
            <div className="divide-y divide-[var(--color-line)]">{top.map((o) => <OpportunityCard key={o.id} o={o} />)}</div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Money signals</h2>
            <p className="mb-4 text-xs text-stone-500">Kept separate on purpose — see Analytics for methodology.</p>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-stone-600">Estimated at risk<br /><span className="text-[11px] text-stone-400">invoices possibly overdue</span></dt>
                <dd className="font-medium text-amber-700"><MoneyByCurrency values={a.atRisk} /></dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-stone-600">Potential opportunity<br /><span className="text-[11px] text-stone-400">open proposals & stated budgets</span></dt>
                <dd className="font-medium"><MoneyByCurrency values={a.potential} /></dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-[var(--color-line)] pt-3">
                <dt className="text-stone-600">Confirmed recovered<br /><span className="text-[11px] text-stone-400">paid after being flagged</span></dt>
                <dd className="font-medium text-emerald-700"><MoneyByCurrency values={a.confirmedRecovered} /></dd>
              </div>
            </dl>
          </Card>
          <NotificationsPanel items={notes.map((n) => ({ ...n, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))} />
          <Card>
            <CardHeader title="Recently resolved" />
            {recovered.length === 0 ? (
              <p className="px-5 py-6 text-sm text-stone-500">Resolved and recovered opportunities will show here.</p>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {recovered.map((o) => (
                  <li key={o.id} className="px-5 py-3">
                    <Link href={`/app/opportunities/${o.id}`} className="text-sm font-medium hover:underline">{o.title}</Link>
                    <div className="mt-0.5 flex justify-between text-xs text-stone-500">
                      <span>{o.resolution} · {fmtDate(o.resolvedAt)}</span>
                      {o.recoveredAmountCents !== null && <Money cents={o.recoveredAmountCents} currency={o.currency} className="text-emerald-700" />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
