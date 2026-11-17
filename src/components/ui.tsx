import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/intel/extract";
import { priorityLabel } from "@/lib/intel/score";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-[var(--color-line)] bg-white", className)}>{children}</div>;
}

export function CardHeader({ title, action, hint }: { title: string; action?: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-5 py-3.5">
      <div>
        <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
        {hint && <p className="text-xs text-stone-500">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

const BTN = {
  primary: "bg-[var(--color-brand)] text-white hover:bg-[#0b3f27] border-transparent",
  secondary: "bg-white text-stone-800 border-[var(--color-line)] hover:bg-stone-50",
  ghost: "bg-transparent text-stone-600 border-transparent hover:bg-stone-100",
  danger: "bg-white text-red-700 border-red-200 hover:bg-red-50",
} as const;

export function buttonClass(variant: keyof typeof BTN = "secondary", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
    BTN[variant],
  );
}

export function LinkButton({ href, children, variant = "secondary", size = "md" }: { href: string; children: ReactNode; variant?: keyof typeof BTN; size?: "sm" | "md" }) {
  return (
    <Link href={href} className={buttonClass(variant, size)}>
      {children}
    </Link>
  );
}

const TONES = {
  neutral: "bg-stone-100 text-stone-700",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  violet: "bg-indigo-50 text-indigo-800 ring-indigo-200",
} as const;

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-transparent", TONES[tone])}>{children}</span>;
}

export const CATEGORY_META: Record<string, { label: string; tone: keyof typeof TONES; short: string }> = {
  unanswered_lead: { label: "Unanswered lead", short: "Lead", tone: "blue" },
  proposal_awaiting: { label: "Proposal awaiting reply", short: "Proposal", tone: "violet" },
  payment_followup: { label: "Payment follow-up", short: "Payment", tone: "amber" },
  client_followup: { label: "Client follow-up", short: "Follow-up", tone: "green" },
};

export function CategoryBadge({ category }: { category: string }) {
  const m = CATEGORY_META[category] ?? { label: category, tone: "neutral" as const };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function PriorityPill({ score }: { score: number }) {
  const l = priorityLabel(score);
  const tone = l === "critical" ? "bg-red-600 text-white" : l === "high" ? "bg-amber-500 text-white" : l === "medium" ? "bg-stone-700 text-white" : "bg-stone-200 text-stone-700";
  return (
    <span title={`Priority score ${score}/100`} className={cx("tabular inline-flex h-6 min-w-9 items-center justify-center rounded-md px-1.5 text-xs font-semibold", tone)}>
      {score}
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-stone-500" title="Evidence confidence">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-stone-200">
        <span className={cx("block h-full rounded-full", pct >= 80 ? "bg-emerald-600" : pct >= 60 ? "bg-amber-500" : "bg-stone-400")} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular">{pct}%</span>
    </span>
  );
}

export function Money({ cents, currency, className }: { cents: number | null; currency: string | null; className?: string }) {
  if (cents === null || cents === undefined) return <span className={cx("text-stone-400", className)}>—</span>;
  return <span className={cx("tabular", className)}>{formatMoney(Number(cents), currency)}</span>;
}

export function MoneyByCurrency({ values, empty = "—" }: { values: Record<string, number>; empty?: string }) {
  const entries = Object.entries(values).filter(([, v]) => v > 0);
  if (entries.length === 0) return <span className="text-stone-400">{empty}</span>;
  return (
    <span className="flex flex-col">
      {entries.map(([cur, v]) => (
        <span key={cur} className="tabular">
          {formatMoney(v, cur)}
        </span>
      ))}
    </span>
  );
}

export function timeAgo(d: Date | string | null): string {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 60) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function EmptyState({ title, body, action }: { title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 h-10 w-10 rounded-full border border-dashed border-stone-300" />
      <h3 className="font-medium text-stone-900">{title}</h3>
      <div className="mt-1 max-w-md text-sm text-stone-500">{body}</div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const inner = (
    <div className="h-full rounded-xl border border-[var(--color-line)] bg-white p-4 transition-colors hover:border-stone-300">
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className="font-display tabular mt-2 text-3xl text-stone-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-stone-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
