import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { connectedAccounts, syncState } from "@/db/schema";
import { safeEqual } from "@/lib/crypto";
import { decodeGmailNotification, verifyGoogleJwt } from "@/lib/gmail/pubsub";
import { enqueue } from "@/lib/jobs/queue";
import { runWorker } from "@/lib/jobs/worker";

/**
 * Gmail push notifications via Google Cloud Pub/Sub (authenticated push subscription).
 * Verification: OIDC JWT (audience = PUBSUB_AUDIENCE, optional service account), and/or a
 * shared secret in the push URL (?token=PUBSUB_VERIFICATION_TOKEN) as defence in depth.
 * The handler only enqueues an idempotent job keyed by historyId and acknowledges quickly;
 * Pub/Sub redeliveries therefore never cause duplicate processing.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const audience = process.env.PUBSUB_AUDIENCE;
  const shared = process.env.PUBSUB_VERIFICATION_TOKEN;
  if (!audience && !shared) return new Response("Webhook not configured", { status: 503 });
  try {
    if (shared) {
      const t = url.searchParams.get("token") ?? "";
      if (!safeEqual(t, shared)) return new Response("Forbidden", { status: 403 });
    }
    if (audience) {
      const authz = req.headers.get("authorization") ?? "";
      if (!authz.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
      await verifyGoogleJwt(authz.slice(7), { audience, serviceAccountEmail: process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL });
    }
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const note = decodeGmailNotification(await req.json().catch(() => null));
  if (!note) return new Response(null, { status: 204 }); // ack malformed messages so they aren't redelivered forever
  const accounts = await db.select().from(connectedAccounts).where(and(eq(connectedAccounts.provider, "gmail"), eq(connectedAccounts.email, note.emailAddress), eq(connectedAccounts.status, "active")));
  for (const a of accounts) {
    await db.update(syncState).set({ lastNotificationAt: new Date() }).where(eq(syncState.connectedAccountId, a.id));
    await enqueue("incremental_sync", { accountId: a.id }, { workspaceId: a.workspaceId, idempotencyKey: `push:${a.id}:${note.historyId}` });
  }
    if (accounts.length) after(() => runWorker({ budgetMs: 8_000 }).catch(() => undefined));
  return new Response(null, { status: 204 });
}
