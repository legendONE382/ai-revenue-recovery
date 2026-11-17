import Link from "next/link";
import { ArrowRight, BadgeCheck, Clock, FileText, Inbox, Lock, MailQuestion, ReceiptText, ShieldCheck } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

const PREVIEW = [
  { cat: "Payment", tone: "bg-amber-50 text-amber-800", title: "£2,400 invoice INV-2041 to Marcus Webb may be overdue", meta: "Due 10 days ago · no payment confirmation found", score: 84 },
  { cat: "Proposal", tone: "bg-indigo-50 text-indigo-800", title: "Proposal with Priya Patel has gone quiet", meta: "$8,500 proposal · 8 days without reply", score: 71 },
  { cat: "Lead", tone: "bg-sky-50 text-sky-800", title: "New enquiry from Sarah Chen has no reply", meta: "Asked about pricing · budget around $6,000", score: 66 },
];

export default async function Landing() {
  const auth = await getAuth();
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-brand)] text-white">
            <Inbox size={15} />
          </span>
          <span className="font-semibold tracking-tight">Inbox Revenue Intelligence</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/privacy" className="hidden px-3 py-2 text-stone-600 hover:text-stone-900 sm:block">
            Privacy
          </Link>
          {auth ? (
            <Link href="/app" className={buttonClass("primary")}>
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="px-3 py-2 text-stone-600 hover:text-stone-900">
                Sign in
              </Link>
              <Link href="/register" className={buttonClass("primary")}>
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-12 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-white px-3 py-1 text-xs text-stone-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> For freelancers, consultants & small agencies
          </p>
          <h1 className="font-display text-5xl leading-[1.05] text-stone-900 sm:text-6xl">Find the revenue hiding in your inbox.</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-600">
            Connect Gmail once. We read your commercial conversations over time and tell you which potential customer, proposal or payment is about to slip through the cracks — with the evidence to prove it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={auth ? "/app/integrations" : "/register"} className={buttonClass("primary") + " px-5 py-2.5 text-base"}>
              Connect Gmail <ArrowRight size={16} />
            </Link>
            <Link href={auth ? "/app" : "/register?demo=1"} className={buttonClass("secondary") + " px-5 py-2.5 text-base"}>
              Try with a sample inbox
            </Link>
          </div>
          <p className="mt-4 text-xs text-stone-500">Read-only access. Nothing is ever sent without your explicit approval.</p>
        </div>

        <div className="relative">
          <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-[0_30px_80px_-30px_rgba(28,25,23,0.25)]">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-semibold">Today&apos;s priorities</div>
              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-stone-500">Sample data</span>
            </div>
            <ul className="space-y-3">
              {PREVIEW.map((p) => (
                <li key={p.title} className="flex items-start gap-3 rounded-lg border border-[var(--color-line)] p-3">
                  <span className="tabular mt-0.5 grid h-6 min-w-9 place-items-center rounded-md bg-stone-800 text-xs font-semibold text-white">{p.score}</span>
                  <div className="min-w-0">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${p.tone}`}>{p.cat}</span>
                    <div className="mt-1 text-sm font-medium text-stone-900">{p.title}</div>
                    <div className="text-xs text-stone-500">{p.meta}</div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-lg bg-[var(--color-brand-soft)] p-3 text-xs text-[var(--color-brand)]">
              <strong>Evidence:</strong> “Please find attached invoice INV-2041 … The amount due is £2,400, payable by …”
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--color-line)] bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="font-display text-3xl">What it watches for</h2>
          <p className="mt-2 max-w-2xl text-stone-600">Four kinds of commercial risk that are easy to miss when work gets busy.</p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: MailQuestion, t: "Unanswered leads", d: "Enquiries, pricing questions and quote requests that never got a reply." },
              { icon: FileText, t: "Quiet proposals", d: "Quotes and proposals where the prospect stopped responding." },
              { icon: ReceiptText, t: "Payment follow-ups", d: "Invoices past their stated due date or missed payment promises — flagged as “potentially overdue”, never assumed unpaid." },
              { icon: Clock, t: "Forgotten follow-ups", d: "Client questions you haven't answered and callbacks you promised." },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t}>
                <Icon className="text-[var(--color-brand)]" size={22} />
                <h3 className="mt-3 font-semibold">{t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-stone-600">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-3">
          <div>
            <h2 className="font-display text-3xl">Built to be trusted with your inbox</h2>
            <p className="mt-3 text-stone-600">This product handles sensitive business communication. Security and honesty are product features, not afterthoughts.</p>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 lg:col-span-2">
            {[
              { icon: Lock, t: "Encrypted credentials", d: "Google tokens are encrypted with AES-256-GCM and never reach your browser." },
              { icon: ShieldCheck, t: "AI is opt-in", d: "Detection is deterministic by default. Email content is only sent to an external AI provider if you switch it on." },
              { icon: BadgeCheck, t: "Evidence for every finding", d: "Each opportunity links to the exact sentences and messages it is based on. Amounts are never invented." },
              { icon: Inbox, t: "You stay in control", d: "Drafts are created for you to review. Disconnect, export or delete your data at any time." },
            ].map(({ icon: Icon, t, d }) => (
              <li key={t} className="rounded-xl border border-[var(--color-line)] bg-white p-5">
                <Icon size={18} className="text-stone-700" />
                <h3 className="mt-2 font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-stone-600">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t border-[var(--color-line)]">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-2 px-6 py-8 text-xs text-stone-500 sm:flex-row">
          <span>Inbox Revenue Intelligence — helping you find revenue hiding in your inbox.</span>
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:text-stone-800">Privacy & data handling</Link>
            <Link href="/terms" className="hover:text-stone-800">Terms</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
