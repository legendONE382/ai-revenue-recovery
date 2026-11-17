import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { connectedAccounts, emailThreads, encryptedOauthTokens, syncState } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getConnector } from "@/lib/connectors";
import { decrypt } from "@/lib/crypto";
import { revokeToken } from "@/lib/gmail/oauth";
import { HttpError, clientIp, json, parseBody, withAuth } from "@/lib/http";
import { enqueue } from "@/lib/jobs/queue";
import { runWorker } from "@/lib/jobs/worker";

type Ctx = { params: Promise<{ id: string }> };

async function ownedAccount(workspaceId: string, id: string) {
  const [a] = await db.select().from(connectedAccounts).where(and(eq(connectedAccounts.id, id), eq(connectedAccounts.workspaceId, workspaceId)));
  if (!a) throw new HttpError(404, "Account not found");
  return a;
}

/** Trigger a sync now (incremental, or full resync with {full:true}). */
export const POST = withAuth<Ctx>(
  async (req, auth, { params }) => {
    const { id } = await params;
    const a = await ownedAccount(auth.workspace.id, id);
    if (a.status !== "active") throw new HttpError(409, "Account is not active; reconnect first");
    const { full } = await parseBody(req, z.object({ full: z.boolean().optional() }));
    if (full) {
      await db.update(syncState).set({ phase: "idle", historyId: null, pageToken: null }).where(eq(syncState.connectedAccountId, a.id));
      await enqueue("initial_sync", { accountId: a.id }, { workspaceId: a.workspaceId, idempotencyKey: `manual-full:${a.id}:${Date.now()}` });
    } else {
      await enqueue("incremental_sync", { accountId: a.id }, { workspaceId: a.workspaceId, idempotencyKey: `manual:${a.id}:${Math.floor(Date.now() / 30000)}` });
    }
    await enqueue("reevaluate_workspace", { workspaceId: a.workspaceId }, { workspaceId: a.workspaceId, idempotencyKey: `manual-reeval:${a.workspaceId}:${Math.floor(Date.now() / 60000)}` });
    after(() => runWorker({ budgetMs: 25_000 }).catch(() => undefined));
    return json({ ok: true });
  },
  { limit: 10 },
);

/**
 * Disconnect: stop the Gmail watch, revoke the Google grant, delete encrypted tokens.
 * With {purge:true} all synchronised email data and derived opportunities are deleted too.
 */
export const DELETE = withAuth<Ctx>(async (req, auth, { params }) => {
  const { id } = await params;
  const a = await ownedAccount(auth.workspace.id, id);
  const { purge } = await parseBody(req, z.object({ purge: z.boolean().default(true) }));
  if (a.provider === "gmail") {
    const connector = getConnector(a);
    await connector.stopWatch?.().catch(() => undefined);
    const [tok] = await db.select().from(encryptedOauthTokens).where(eq(encryptedOauthTokens.connectedAccountId, a.id));
    if (tok) {
      try {
        await revokeToken(decrypt(tok.refreshTokenEnc ?? tok.accessTokenEnc, `oauth:${a.id}`));
      } catch {
        /* key rotated or token already invalid — continue with local deletion */
      }
    }
  }
  await db.delete(encryptedOauthTokens).where(eq(encryptedOauthTokens.connectedAccountId, a.id));
  if (purge) {
    await db.delete(emailThreads).where(eq(emailThreads.accountId, a.id)); // cascades to messages, opportunities, evidence, drafts
    await db.delete(connectedAccounts).where(eq(connectedAccounts.id, a.id));
  } else {
    await db.update(connectedAccounts).set({ status: "disconnected", statusMessage: "Disconnected by user", watchExpiration: null }).where(eq(connectedAccounts.id, a.id));
  }
  await audit({ workspaceId: auth.workspace.id, userId: auth.user.id, action: purge ? "account.disconnected_and_purged" : "account.disconnected", targetType: "connected_account", targetId: a.id, ip: clientIp(req) });
  return json({ ok: true });
});
