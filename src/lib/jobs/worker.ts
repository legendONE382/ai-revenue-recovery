import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { db } from "@/db";
import { agentExecutionLogs, connectedAccounts, emailMessages, workspaces } from "@/db/schema";
import { analyseAndPersistThread, reevaluateWorkspace } from "@/lib/agents/orchestrator";
import { dailySummary, emailNotifications, fireReminders } from "@/lib/notifications";
import { emailConfigured } from "@/lib/env";
import { renewWatches, runIncrementalSync, runInitialSyncPage } from "@/lib/sync";
import { claimJobs, completeJob, enqueue, failJob, withTimeout, type Job, type JobType } from "./queue";

const TIMEOUTS: Record<JobType, number> = {
  initial_sync: 120_000,
  incremental_sync: 60_000,
  analyse_thread: 45_000,
  reevaluate_workspace: 240_000,
  renew_watches: 60_000,
  fire_reminders: 30_000,
  daily_summary: 30_000,
  purge_retention: 60_000,
  email_notifications: 30_000,
};

async function handle(job: Job): Promise<unknown> {
  const p = job.payload as Record<string, string>;
  switch (job.type as JobType) {
    case "initial_sync":
      return runInitialSyncPage(p.accountId);
    case "incremental_sync":
      return runIncrementalSync(p.accountId);
    case "analyse_thread":
      return analyseAndPersistThread(p.threadId, job.id);
    case "reevaluate_workspace":
      return reevaluateWorkspace(p.workspaceId, job.id);
    case "renew_watches":
      return renewWatches();
    case "fire_reminders":
      return fireReminders();
    case "daily_summary":
      return dailySummary(p.workspaceId);
    case "purge_retention":
      return purgeRetention();
    case "email_notifications":
      return emailNotifications(p.workspaceId);
    default:
      throw new Error(`Unknown job type ${job.type}`);
  }
}

/** Data retention: drop message bodies past each workspace's retention window (default 180 days). */
async function purgeRetention() {
  const wss = await db.select({ id: workspaces.id, settings: workspaces.settings }).from(workspaces);
  let n = 0;
  for (const w of wss) {
    const days = w.settings?.retentionDays ?? 180;
    const res = await db
      .update(emailMessages)
      .set({ bodyText: null })
      .where(and(eq(emailMessages.workspaceId, w.id), lt(emailMessages.sentAt, new Date(Date.now() - days * 86_400_000)), sql`${emailMessages.bodyText} is not null`))
      .returning({ id: emailMessages.id });
    n += res.length;
  }
  await db.execute(sql`delete from agent_tasks where status = 'succeeded' and completed_at < now() - interval '14 days'`);
  await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
  await db.execute(sql`delete from password_reset_tokens where expires_at < now() - interval '1 day'`);
  await db.execute(sql`delete from sessions where expires_at < now()`);
  return n;
}

/**
 * Processes jobs until the time budget is spent or the queue is empty. Safe to call from a
 * cron route, a webhook's `after()` callback, or a long-running worker process.
 */
export async function runWorker({ budgetMs = 50_000, workerId = `w-${crypto.randomUUID().slice(0, 8)}` } = {}) {
  const deadline = Date.now() + budgetMs;
  let processed = 0;
  let failed = 0;
  while (Date.now() < deadline - 5_000) {
    const jobs = await claimJobs(workerId, 5);
    if (jobs.length === 0) break;
    for (const job of jobs) {
      const started = Date.now();
      try {
        const out = await withTimeout(handle(job), TIMEOUTS[job.type as JobType] ?? 60_000, job.type);
        await completeJob(job.id);
        processed++;
        if (job.type !== "analyse_thread") {
          await db.insert(agentExecutionLogs).values({ workspaceId: job.workspaceId, taskId: job.id, agent: `orchestrator:${job.type}`, status: "ok", durationMs: Date.now() - started, output: { result: JSON.parse(JSON.stringify(out ?? null)) } });
        }
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : "job failed";
        await failJob(job, msg);
        await db.insert(agentExecutionLogs).values({ workspaceId: job.workspaceId, taskId: job.id, agent: `orchestrator:${job.type}`, status: "error", durationMs: Date.now() - started, error: msg.slice(0, 500) });
      }
    }
  }
  return { processed, failed };
}

/** Enqueues recurring work. Idempotency keys bucket by time so repeated cron calls are harmless. */
export async function scheduleRecurring(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const hour = now.toISOString().slice(0, 13);
  const sixHour = `${day}-${Math.floor(now.getUTCHours() / 6)}`;
  const quarter = `${hour}-${Math.floor(now.getUTCMinutes() / 15)}`;
  const fiveMin = `${hour}-${Math.floor(now.getUTCMinutes() / 5)}`;
  await enqueue("fire_reminders", {}, { idempotencyKey: `reminders:${fiveMin}` });
  await enqueue("renew_watches", {}, { idempotencyKey: `watches:${day}` });
  await enqueue("purge_retention", {}, { idempotencyKey: `purge:${day}` });
  const wss = await db.select({ id: workspaces.id }).from(workspaces);
  for (const w of wss) {
    await enqueue("reevaluate_workspace", { workspaceId: w.id }, { workspaceId: w.id, idempotencyKey: `reeval:${w.id}:${sixHour}` });
    if (emailConfigured()) await enqueue("email_notifications", { workspaceId: w.id }, { workspaceId: w.id, idempotencyKey: `email:${w.id}:${quarter}`, maxAttempts: 3 });
    if (now.getUTCHours() >= 7) await enqueue("daily_summary", { workspaceId: w.id }, { workspaceId: w.id, idempotencyKey: `summary:${w.id}:${day}` });
  }
  // Polling fallback when Pub/Sub push is not configured (or as a safety net every 15 min).
  const accounts = await db.select({ id: connectedAccounts.id, ws: connectedAccounts.workspaceId }).from(connectedAccounts).where(and(eq(connectedAccounts.provider, "gmail"), eq(connectedAccounts.status, "active")));
  for (const a of accounts) await enqueue("incremental_sync", { accountId: a.id }, { workspaceId: a.ws, idempotencyKey: `poll:${a.id}:${quarter}` });
}
