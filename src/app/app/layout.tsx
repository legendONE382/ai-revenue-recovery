import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { db } from "@/db";
import { notifications, opportunities } from "@/db/schema";
import { AppNav } from "@/components/app-nav";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const auth = await requireAuth();
  if (!auth.workspace.settings.onboardingComplete) redirect("/onboarding");
  const [o] = await db.select({ n: sql<number>`count(*)::int` }).from(opportunities).where(and(eq(opportunities.workspaceId, auth.workspace.id), eq(opportunities.status, "open")));
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.workspaceId, auth.workspace.id), isNull(notifications.readAt)));
  return (
    <div className="min-h-screen">
      <AppNav email={auth.user.email} workspace={auth.workspace.name} counts={{ opps: o?.n ?? 0, unread: n?.n ?? 0 }} />
      <main className="lg:pl-60">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
