"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BarChart3, Bot, Inbox, LayoutDashboard, LogOut, Mail, Menu, MessagesSquare, PenLine, Plug, Settings, Target, X } from "lucide-react";
import { api } from "@/lib/client";
import { cx } from "./ui";

const NAV = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/opportunities", label: "Opportunities", icon: Target },
  { href: "/app/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/app/follow-ups", label: "Follow-ups", icon: PenLine },
  { href: "/app/assistant", label: "AI Assistant", icon: Bot },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/app/integrations", label: "Integrations", icon: Plug },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function AppNav({ email, workspace, counts }: { email: string; workspace: string; counts: { opps: number; unread: number } }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));

  const nav = (
    <nav className="flex h-full flex-col">
      <Link href="/app" className="flex items-center gap-2 px-5 py-5">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-brand)] text-white">
          <Inbox size={15} />
        </span>
        <span className="text-sm font-semibold leading-tight">
          Inbox Revenue
          <br />
          <span className="font-normal text-stone-500">Intelligence</span>
        </span>
      </Link>
      <ul className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              onClick={() => setOpen(false)}
              className={cx("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors", active(href) ? "bg-white font-medium text-stone-900 shadow-sm ring-1 ring-[var(--color-line)]" : "text-stone-600 hover:bg-white/60 hover:text-stone-900")}
            >
              <Icon size={16} className={active(href) ? "text-[var(--color-brand)]" : ""} />
              <span className="flex-1">{label}</span>
              {href === "/app/opportunities" && counts.opps > 0 && <span className="tabular rounded bg-stone-200 px-1.5 text-[11px] text-stone-700">{counts.opps}</span>}
              {href === "/app" && counts.unread > 0 && <span className="tabular rounded bg-red-600 px-1.5 text-[11px] text-white">{counts.unread}</span>}
            </Link>
          </li>
        ))}
      </ul>
      <div className="border-t border-[var(--color-line)] px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-stone-200 text-stone-600">
            <Mail size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{workspace}</div>
            <div className="truncate text-xs text-stone-500">{email}</div>
          </div>
          <button
            title="Sign out"
            className="rounded p-1.5 text-stone-500 hover:bg-stone-200"
            onClick={async () => {
              await api("/api/auth/logout", "POST", {});
              router.push("/");
              router.refresh();
            }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-[var(--color-line)] bg-[#f3f2ee] lg:block">{nav}</aside>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--color-line)] bg-[#f3f2ee] px-4 py-3 lg:hidden">
        <span className="text-sm font-semibold">Inbox Revenue Intelligence</span>
        <button onClick={() => setOpen(true)} className="rounded p-1.5 hover:bg-stone-200" aria-label="Open menu">
          <Menu size={18} />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-[#f3f2ee]">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded p-1.5 hover:bg-stone-200" aria-label="Close menu">
              <X size={16} />
            </button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
