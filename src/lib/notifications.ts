import "server-only";
import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { notificationPreferences, notifications, opportunities, reminders, users, workspaces } from "@/db/schema";
import { digestEmail, sendEmail } from "./email";
import { emailConfigured } from "./env";

/** Fires due reminders and wakes snoozed opportunities. Dedupe keys prevent repeat notifications. */
export async function fireReminders(now = new Date()) {
  const due = await db.select().from(reminders).where(and(eq(reminders.status, "pending"), lte(reminders.remindAt, now))).limit(200);
  for (const r of due) {
    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, r.opportunityId));
    await db.update(reminders).set({ status: "fired" }).where(eq(reminders.id, r.id));
    if (!opp || opp.status === "resolved" || opp.status === "dismissed") continue;
    if (opp.status === "snoozed") await db.update(opportunities).set({ status: "open", snoozedUntil: null, updatedAt: now }).where(eq(opportunities.id, opp.id));
    const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.workspaceId, r.workspaceId));
    if (prefs && !prefs.overdueFollowUp) continue;
    await db
      .insert(notifications)
      .values({ workspaceId: r.workspaceId, opportunityId: opp.id, type: "reminder", title: `Reminder: ${opp.title}`, body: r.reason, dedupeKey: `reminder:${r.id}` })
      .onConflictDoNothing();
  }
  // Snoozes without an explicit reminder row
  await db.execute(sql`update opportunities set status = 'open', snoozed_until = null, updated_at = now() where status = 'snoozed' and snoozed_until <= now()`);
  return due.length;
}

/**
 * Email delivery of in-app notifications, batched into a single digest per run so an initial
 * sync never produces a flood of emails. Each notification is emailed at most once (emailed_at).
 * Stale notifications (>24h) are marked without sending.
 */
export async function emailNotifications(workspaceId: string) {
  if (!emailConfigured()) return { sent: 0, reason: "email not configured" };
  const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.workspaceId, workspaceId));
  const pending = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.workspaceId, workspaceId), isNull(notifications.emailedAt), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
  if (pending.length === 0) return { sent: 0 };
  const markAll = () => db.update(notifications).set({ emailedAt: new Date() }).where(inArray(notifications.id, pending.map((p) => p.id)));
  const fresh = pending.filter((p) => Date.now() - p.createdAt.getTime() < 86_400_000);
  if ((prefs && !prefs.emailNotifications) || fresh.length === 0) {
    await markAll();
    return { sent: 0, reason: "disabled or stale" };
  }
  const [owner] = await db.select({ email: users.email }).from(workspaces).innerJoin(users, eq(users.id, workspaces.ownerUserId)).where(eq(workspaces.id, workspaceId));
  if (!owner) return { sent: 0 };
  const items = fresh.slice(0, 15).map((n) => ({ title: n.title, body: n.body, href: n.opportunityId ? `/app/opportunities/${n.opportunityId}` : "/app" }));
  const r = await sendEmail(digestEmail(owner.email, items));
  if (!r.sent) throw new Error(r.error ?? "email send failed"); // job retries with backoff
  await markAll();
  return { sent: 1, items: items.length };
}

/** One summary per workspace per day, only if there is something to act on. */
export async function dailySummary(workspaceId: string, now = new Date()) {
  const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.workspaceId, workspaceId));
  if (prefs && !prefs.dailySummary) return false;
  const rows = await db
    .select({ category: opportunities.category, n: sql<number>`count(*)::int`, top: sql<string>`(array_agg(${opportunities.title} order by ${opportunities.priorityScore} desc))[1]` })
    .from(opportunities)
    .where(and(eq(opportunities.workspaceId, workspaceId), eq(opportunities.status, "open")))
    .groupBy(opportunities.category);
  const total = rows.reduce((n, r) => n + r.n, 0);
  if (total === 0) return false;
  const label: Record<string, string> = { unanswered_lead: "unanswered leads", proposal_awaiting: "proposals awaiting response", payment_followup: "payment follow-ups", client_followup: "client follow-ups" };
  const day = now.toISOString().slice(0, 10);
  await db
    .insert(notifications)
    .values({
      workspaceId,
      type: "daily_summary",
      title: `Daily summary: ${total} open opportunit${total === 1 ? "y" : "ies"}`,
      body: rows.map((r) => `${r.n} ${label[r.category] ?? r.category}`).join(" · "),
      dedupeKey: `daily:${day}`,
    })
    .onConflictDoNothing();
  return true;
}
