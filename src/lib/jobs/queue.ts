import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { agentTasks } from "@/db/schema";

/**
 * Postgres-backed job queue (agent_tasks).
 * - Idempotency: `idempotency_key` is UNIQUE; duplicate enqueues (e.g. repeated Pub/Sub
 *   deliveries for the same historyId) are no-ops.
 * - Concurrency: jobs are claimed with FOR UPDATE SKIP LOCKED, so multiple workers are safe.
 * - Recovery: jobs locked longer than LOCK_TIMEOUT are reclaimed (crashed worker / killed
 *   serverless invocation). Failures retry with exponential backoff, then go to `dead`.
 * No Redis required: volumes for a single-business inbox are tiny for Postgres.
 */
export type JobType =
  | "initial_sync"
  | "incremental_sync"
  | "analyse_thread"
  | "reevaluate_workspace"
  | "renew_watches"
  | "fire_reminders"
  | "daily_summary"
  | "purge_retention"
  | "email_notifications";

export type Job = typeof agentTasks.$inferSelect;

export async function enqueue(
  type: JobType,
  payload: Record<string, unknown>,
  opts: { workspaceId?: string | null; idempotencyKey?: string; runAfter?: Date; maxAttempts?: number } = {},
): Promise<boolean> {
  const rows = await db
    .insert(agentTasks)
    .values({
      type,
      payload,
      workspaceId: opts.workspaceId ?? null,
      idempotencyKey: opts.idempotencyKey ?? null,
      runAfter: opts.runAfter ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 5,
    })
    .onConflictDoNothing({ target: agentTasks.idempotencyKey })
    .returning({ id: agentTasks.id });
  return rows.length > 0;
}

const LOCK_TIMEOUT_MIN = 10;

export async function claimJobs(workerId: string, limit = 5): Promise<Job[]> {
  const res = await db.execute(sql`
    update agent_tasks set status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1
    where id in (
      select id from agent_tasks
      where (status = 'queued' and run_after <= now())
         or (status = 'running' and locked_at < now() - make_interval(mins => ${LOCK_TIMEOUT_MIN}))
      order by run_after asc
      limit ${limit}
      for update skip locked
    )
    returning id, workspace_id as "workspaceId", type, payload, status, attempts, max_attempts as "maxAttempts", idempotency_key as "idempotencyKey"`);
  return res.rows as unknown as Job[];
}

export async function completeJob(id: string) {
  await db.execute(sql`update agent_tasks set status = 'succeeded', completed_at = now(), locked_at = null, last_error = null where id = ${id}`);
}

export async function failJob(job: Pick<Job, "id" | "attempts" | "maxAttempts">, error: string) {
  const dead = job.attempts >= job.maxAttempts;
  const backoffSec = Math.min(3600, 30 * 2 ** job.attempts);
  await db.execute(sql`
    update agent_tasks set
      status = ${dead ? "dead" : "queued"},
      last_error = ${error.slice(0, 1000)},
      locked_at = null,
      run_after = now() + make_interval(secs => ${backoffSec})
    where id = ${job.id}`);
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
