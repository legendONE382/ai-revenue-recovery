import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agentExecutionLogs } from "@/db/schema";
import { CATEGORY_META, Card, CardHeader, MoneyByCurrency, PageHeader, Stat } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { analytics } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const auth = await requireAuth();
  const a = await analytics(auth.workspace.id);
  const usage = await db
    .select({ agent: agentExecutionLogs.agent, runs: sql<number>`count(*)::int`, errors: sql<number>`count(*) filter (where ${agentExecutionLogs.status} = 'error')::int`, tokensIn: sql<number>`coalesce(sum(${agentExecutionLogs.tokensIn}),0)::int`, tokensOut: sql<number>`coalesce(sum(${agentExecutionLogs.tokensOut}),0)::int` })
    .from(agentExecutionLogs)
    .where(eq(agentExecutionLogs.workspaceId, auth.workspace.id))
    .groupBy(agentExecutionLogs.agent)
    .orderBy(desc(sql`count(*)`));

  const figures = [
    { n: "1", title: "Confirmed revenue recovered", value: a.confirmedRecovered, tone: "text-emerald-700", method: "Sum of opportunities that were flagged and later resolved as paid — either a payment confirmation appeared in the conversation, or you marked it paid and entered the amount received. We don't claim we caused the payment, only that it was recovered after being flagged." },
    { n: "2", title: "Estimated revenue at risk", value: a.atRisk, tone: "text-amber-700", method: "Open payment follow-ups: invoice amounts stated in your emails where the due date (stated, promised, or assumed when missing — always shown) has passed without a payment confirmation. Payment may have arrived without an email; verify before chasing." },
    { n: "3", title: "Potential revenue opportunity", value: a.potential, tone: "text-stone-900", method: "Open proposals with a price in the email, plus budgets explicitly stated by prospects in unanswered leads. Not a forecast — many will not convert." },
    { n: "4", title: "Hypothetical revenue improvement", value: {}, tone: "text-stone-400", method: "Deliberately not calculated. Estimating what you would have earned requires conversion assumptions we cannot verify from email, so we don't show a number." },
  ];

  return (
    <>
      <PageHeader title="Analytics" subtitle="Metrics built only from evidence. Financial figures are kept separate and per-currency — they are never added together." />
      <div className="grid gap-4 md:grid-cols-2">
        {figures.map((f) => (
          <Card key={f.n} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  {f.n}. {f.title}
                </div>
                <div className={`font-display mt-2 text-3xl ${f.tone}`}>{f.n === "4" ? "Not calculated" : <MoneyByCurrency values={f.value} empty="None yet" />}</div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-stone-500">{f.method}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Identified" value={a.identified} />
        <Stat label="Open" value={a.open} />
        <Stat label="Resolved" value={a.resolved} />
        <Stat label="Drafts prepared" value={a.draftsPrepared} />
        <Stat label="Gmail drafts" value={a.gmailDrafts} />
        <Stat label="Sent (confirmed)" value={a.sentConfirmed} hint="you confirmed sending" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="By category" hint="All-time findings" />
          <ul className="space-y-3 p-5 text-sm">
            {Object.entries(CATEGORY_META).map(([k, m]) => {
              const n = a.byCategory[k] ?? 0;
              const max = Math.max(1, ...Object.values(a.byCategory));
              return (
                <li key={k}>
                  <div className="mb-1 flex justify-between"><span>{m.label}</span><span className="tabular">{n}</span></div>
                  <div className="h-1.5 rounded-full bg-stone-100"><div className="h-full rounded-full bg-stone-700" style={{ width: `${(n / max) * 100}%` }} /></div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Outcomes & quality" />
          <dl className="space-y-2.5 p-5 text-sm">
            {Object.entries(a.byResolution).map(([k, v]) => (
              <div key={k} className="flex justify-between"><dt className="capitalize text-stone-600">{k.replace(/_/g, " ")}</dt><dd className="tabular">{v}</dd></div>
            ))}
            <div className="flex justify-between"><dt className="text-stone-600">Won deal value</dt><dd><MoneyByCurrency values={a.wonValue} /></dd></div>
            <div className="flex justify-between border-t border-[var(--color-line)] pt-2.5"><dt className="text-stone-600">Dismissed as false positive</dt><dd className="tabular">{a.dismissed} ({Math.round(a.falsePositiveRate * 100)}%)</dd></div>
            <div className="flex justify-between"><dt className="text-stone-600">Open without a known amount</dt><dd className="tabular">{a.unknownAmount}</dd></div>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Agent activity & AI usage" hint="Execution log totals" />
          {usage.length === 0 ? (
            <p className="p-5 text-sm text-stone-500">No agent runs yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-stone-500">
                <tr><th className="px-5 py-2 font-medium">Agent</th><th className="py-2 font-medium">Runs</th><th className="py-2 font-medium">Err</th><th className="py-2 pr-5 text-right font-medium">Tokens</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {usage.map((u) => (
                  <tr key={u.agent}><td className="px-5 py-1.5">{u.agent}</td><td className="tabular">{u.runs}</td><td className="tabular">{u.errors}</td><td className="tabular pr-5 text-right">{u.tokensIn + u.tokensOut || "—"}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
