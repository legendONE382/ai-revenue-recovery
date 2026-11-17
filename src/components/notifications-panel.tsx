"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell } from "lucide-react";
import { api } from "@/lib/client";
import { cx } from "./ui";

type N = { id: string; title: string; body: string; type: string; opportunityId: string | null; readAt: string | null; createdAt: string };

export function NotificationsPanel({ items }: { items: N[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const unread = items.filter((i) => !i.readAt).length;
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-white">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Bell size={14} /> Notifications {unread > 0 && <span className="tabular rounded bg-red-600 px-1.5 text-[11px] text-white">{unread}</span>}
        </h2>
        {unread > 0 && (
          <button
            disabled={busy}
            className="text-xs text-stone-500 hover:text-stone-900"
            onClick={async () => {
              setBusy(true);
              await api("/api/settings", "PATCH", { markNotificationsRead: true });
              router.refresh();
              setBusy(false);
            }}
          >
            Mark all read
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-stone-500">No notifications yet.</p>
      ) : (
        <ul className="max-h-96 divide-y divide-[var(--color-line)] overflow-y-auto">
          {items.map((n) => {
            const inner = (
              <div className="flex gap-3 px-5 py-3">
                <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-red-500")} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-stone-900">{n.title}</div>
                  <div className="text-xs text-stone-500">{n.body}</div>
                  <div className="mt-0.5 text-[11px] text-stone-400">{new Date(n.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            );
            return <li key={n.id}>{n.opportunityId ? <Link href={`/app/opportunities/${n.opportunityId}`} className="block hover:bg-stone-50">{inner}</Link> : inner}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
