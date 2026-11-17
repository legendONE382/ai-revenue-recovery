import Link from "next/link";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-[var(--color-brand)] text-white">
            <Inbox size={16} />
          </span>
          <span className="font-semibold tracking-tight">Inbox Revenue Intelligence</span>
        </Link>
        <div className="rounded-2xl border border-[var(--color-line)] bg-white p-7 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
