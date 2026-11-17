import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import { gmailLink, type OpportunityRow } from "@/lib/data";
import { Badge, CategoryBadge, ConfidenceMeter, Money, PriorityPill, timeAgo } from "./ui";

export function OpportunityCard({ o }: { o: OpportunityRow }) {
  const link = gmailLink(o.provider, o.accountEmail, o.providerThreadId);
  return (
    <div className="group flex gap-4 px-5 py-4 transition-colors hover:bg-stone-50/70">
      <div className="pt-0.5">
        <PriorityPill score={o.priorityScore} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={o.category} />
          {o.status !== "open" && <Badge tone={o.status === "resolved" ? "green" : "neutral"}>{o.status}{o.resolution ? ` · ${o.resolution}` : ""}</Badge>}
          {o.stage && <span className="text-[11px] text-stone-400">{o.stage.replace(/_/g, " ")}</span>}
        </div>
        <Link href={`/app/opportunities/${o.id}`} className="mt-1 block font-medium text-stone-900 hover:underline">
          {o.title}
        </Link>
        <p className="mt-0.5 line-clamp-2 text-sm text-stone-600">{o.summary}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
          <span>
            {o.contactName ?? o.contactEmail}
            {o.companyDomain && <span className="text-stone-400"> · {o.companyName ?? o.companyDomain}</span>}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock size={12} /> {timeAgo(o.lastInteractionAt)}
          </span>
          <ConfidenceMeter value={o.confidence} />
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-stone-900">
              Gmail <ArrowUpRight size={12} />
            </a>
          )}
        </div>
        {o.recommendedAction && o.status === "open" && <p className="mt-2 text-xs text-[var(--color-brand)]">→ {o.recommendedAction}</p>}
      </div>
      <div className="hidden text-right sm:block">
        <Money cents={o.amountCents} currency={o.currency} className="font-display text-lg text-stone-900" />
        {o.amountCents !== null && <div className="text-[11px] text-stone-400">{o.amountSource === "user" ? "corrected by you" : "from email"}</div>}
      </div>
    </div>
  );
}
