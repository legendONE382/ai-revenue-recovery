import { safeEqual } from "@/lib/crypto";
import { runWorker, scheduleRecurring } from "@/lib/jobs/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduler + worker entrypoint. Call every 1–5 minutes from any scheduler
 * (Vercel Cron, GitHub Actions, cron-job.org, systemd timer, or scripts/worker.mjs).
 * Auth: Authorization: Bearer $CRON_SECRET.
 */
async function handler(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || !provided || !safeEqual(provided, secret)) return new Response("Unauthorized", { status: 401 });
  await scheduleRecurring();
  const result = await runWorker({ budgetMs: 50_000 });
  return Response.json({ ok: true, ...result });
}

export const GET = handler;
export const POST = handler;
