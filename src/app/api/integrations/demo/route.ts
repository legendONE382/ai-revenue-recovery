import { db } from "@/db";
import { connectedAccounts, syncState } from "@/db/schema";
import { analyseAllPending } from "@/lib/agents/orchestrator";
import { audit } from "@/lib/audit";
import { DEMO_OWNER } from "@/lib/fixtures/demo-emails";
import { json, withAuth } from "@/lib/http";
import { runInitialSyncPage } from "@/lib/sync";

/**
 * DEMO MODE: connects a clearly-labelled sample mailbox that runs through the exact same
 * ingestion → analysis → detection pipeline as Gmail. No real email is involved.
 */
export const POST = withAuth(
  async (req, auth) => {
    const [account] = await db
      .insert(connectedAccounts)
      .values({ workspaceId: auth.workspace.id, provider: "demo", email: DEMO_OWNER.email, status: "active", scopes: "demo" })
      .onConflictDoUpdate({ target: [connectedAccounts.workspaceId, connectedAccounts.provider, connectedAccounts.email], set: { status: "active" } })
      .returning();
    await db.insert(syncState).values({ connectedAccountId: account.id }).onConflictDoNothing();
    const r = await runInitialSyncPage(account.id);
    const analysed = await analyseAllPending(auth.workspace.id);
    await audit({ workspaceId: auth.workspace.id, userId: auth.user.id, action: "demo.connected", targetId: account.id });
    return json({ ok: true, synced: r.synced, analysed });
  },
  { limit: 10 },
);
