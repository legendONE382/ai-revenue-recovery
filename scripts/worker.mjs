#!/usr/bin/env node
/**
 * Long-running worker loop for always-on hosts (VPS, Fly.io, Railway, Render background worker).
 * It simply calls the authenticated scheduler endpoint on an interval, so all job logic stays
 * inside the app (single code path for serverless and server deployments).
 *
 *   APP_URL=https://your.app CRON_SECRET=... node scripts/worker.mjs
 */
const url = `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/cron/tick`;
const secret = process.env.CRON_SECRET;
const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);
if (!secret) {
  console.error("CRON_SECRET is required");
  process.exit(1);
}
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

while (!stopping) {
  const started = Date.now();
  try {
    const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(90_000) });
    const body = await r.json().catch(() => ({}));
    console.log(new Date().toISOString(), r.status, JSON.stringify(body));
  } catch (e) {
    console.error(new Date().toISOString(), "tick failed:", e instanceof Error ? e.message : e);
  }
  const wait = Math.max(5_000, intervalMs - (Date.now() - started));
  await new Promise((r) => setTimeout(r, wait));
}
