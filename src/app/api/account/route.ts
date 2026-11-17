import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  connectedAccounts,
  contacts,
  emailMessages,
  emailThreads,
  encryptedOauthTokens,
  extractedFinancialRecords,
  followUpDrafts,
  opportunities,
  opportunityEvidence,
  sessions,
  userFeedback,
  users,
  workspaces,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { destroySession } from "@/lib/auth";
import { decrypt, hashPassword, verifyPassword } from "@/lib/crypto";
import { revokeToken } from "@/lib/gmail/oauth";
import { HttpError, clientIp, json, parseBody, withAuth } from "@/lib/http";

/** Data export (GDPR-style portability). Excludes credentials and encrypted secrets. */
export const GET = withAuth(
  async (_req, auth) => {
    const ws = auth.workspace.id;
    const accounts = await db.select({ id: connectedAccounts.id, provider: connectedAccounts.provider, email: connectedAccounts.email, status: connectedAccounts.status, createdAt: connectedAccounts.createdAt }).from(connectedAccounts).where(eq(connectedAccounts.workspaceId, ws));
    const opps = await db.select().from(opportunities).where(eq(opportunities.workspaceId, ws));
    const data = {
      exportedAt: new Date().toISOString(),
      user: auth.user,
      workspace: auth.workspace,
      connectedAccounts: accounts,
      contacts: await db.select().from(contacts).where(eq(contacts.workspaceId, ws)),
      threads: await db.select().from(emailThreads).where(eq(emailThreads.workspaceId, ws)),
      messages: await db.select().from(emailMessages).where(eq(emailMessages.workspaceId, ws)),
      opportunities: opps,
      evidence: opps.length ? await db.select().from(opportunityEvidence).where(inArray(opportunityEvidence.opportunityId, opps.map((o) => o.id))) : [],
      financialRecords: await db.select().from(extractedFinancialRecords).where(eq(extractedFinancialRecords.workspaceId, ws)),
      drafts: await db.select().from(followUpDrafts).where(eq(followUpDrafts.workspaceId, ws)),
      feedback: await db.select().from(userFeedback).where(eq(userFeedback.workspaceId, ws)),
      auditLog: await db.select().from(auditLogs).where(eq(auditLogs.workspaceId, ws)),
    };
    await audit({ workspaceId: ws, userId: auth.user.id, action: "account.exported" });
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="inbox-revenue-export-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" },
    });
  },
  { limit: 5, windowSec: 300 },
);

const Patch = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(10, "New password must be at least 10 characters").max(200).optional(),
});

/** Update profile name and/or password. Password change signs out all other sessions. */
export const PATCH = withAuth(
  async (req, auth) => {
    const body = await parseBody(req, Patch);
    if (body.name) await db.update(users).set({ name: body.name }).where(eq(users.id, auth.user.id));
    if (body.newPassword) {
      const [u] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, auth.user.id));
      if (!body.currentPassword || !(await verifyPassword(body.currentPassword, u.passwordHash))) throw new HttpError(400, "Current password is incorrect");
      await db.update(users).set({ passwordHash: await hashPassword(body.newPassword) }).where(eq(users.id, auth.user.id));
      await db.delete(sessions).where(and(eq(sessions.userId, auth.user.id), ne(sessions.id, auth.sessionId)));
      await audit({ workspaceId: auth.workspace.id, userId: auth.user.id, action: "auth.password_changed", ip: clientIp(req) });
    }
    return json({ ok: true });
  },
  { limit: 10, windowSec: 300 },
);

/** Permanent account deletion: revokes Google grants, then cascades all workspace data. */
export const DELETE = withAuth(
  async (req, auth) => {
    const { confirm } = await parseBody(req, z.object({ confirm: z.string() }));
    if (confirm !== "DELETE") throw new HttpError(400, 'Type "DELETE" to confirm');
    const accounts = await db.select().from(connectedAccounts).where(eq(connectedAccounts.workspaceId, auth.workspace.id));
    for (const a of accounts) {
      const [tok] = await db.select().from(encryptedOauthTokens).where(eq(encryptedOauthTokens.connectedAccountId, a.id));
      if (tok) {
        try {
          await revokeToken(decrypt(tok.refreshTokenEnc ?? tok.accessTokenEnc, `oauth:${a.id}`));
        } catch {
          /* continue */
        }
      }
    }
    await audit({ userId: null, action: "account.deleted", metadata: { userIdHash: auth.user.id.slice(0, 8) }, ip: clientIp(req) });
    await db.delete(workspaces).where(eq(workspaces.id, auth.workspace.id));
    await db.delete(users).where(eq(users.id, auth.user.id));
    await destroySession();
    return json({ ok: true });
  },
  { limit: 3, windowSec: 300 },
);
