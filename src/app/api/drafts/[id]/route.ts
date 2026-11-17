import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { connectedAccounts, emailMessages, emailThreads, followUpDrafts, opportunities } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getConnector } from "@/lib/connectors";
import { HttpError, json, parseBody, withAuth } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

async function owned(workspaceId: string, id: string) {
  const [d] = await db.select().from(followUpDrafts).where(and(eq(followUpDrafts.id, id), eq(followUpDrafts.workspaceId, workspaceId)));
  if (!d) throw new HttpError(404, "Draft not found");
  return d;
}

/** Edit, discard, or confirm the user sent it themselves. */
export const PATCH = withAuth<Ctx>(async (req, auth, { params }) => {
  const { id } = await params;
  const d = await owned(auth.workspace.id, id);
  const body = await parseBody(req, z.object({ subject: z.string().min(1).max(200).optional(), body: z.string().min(1).max(10000).optional(), status: z.enum(["draft", "discarded", "sent_confirmed"]).optional() }));
  await db.update(followUpDrafts).set({ ...body, updatedAt: new Date() }).where(eq(followUpDrafts.id, d.id));
  if (body.status === "sent_confirmed") {
    await db.update(opportunities).set({ stage: "contacted", updatedAt: new Date() }).where(and(eq(opportunities.id, d.opportunityId), eq(opportunities.stage, "new")));
  }
  await audit({ workspaceId: auth.workspace.id, userId: auth.user.id, action: body.status ? `draft.${body.status}` : "draft.edited", targetType: "follow_up_draft", targetId: d.id });
  return json({ ok: true });
});

/** Create the draft in the user's Gmail (explicit user action; never sends). */
export const POST = withAuth<Ctx>(
  async (req, auth, { params }) => {
    const { id } = await params;
    const d = await owned(auth.workspace.id, id);
    if (d.status === "discarded") throw new HttpError(409, "Draft was discarded");
    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, d.opportunityId));
    const [thread] = await db.select().from(emailThreads).where(eq(emailThreads.id, opp.threadId));
    const [account] = await db.select().from(connectedAccounts).where(eq(connectedAccounts.id, thread.accountId));
    if (account.status !== "active") throw new HttpError(409, "Mailbox is not connected");
    const [last] = await db.select({ headers: emailMessages.headers }).from(emailMessages).where(eq(emailMessages.threadId, thread.id)).orderBy(desc(emailMessages.sentAt)).limit(1);
    try {
      const draftId = await getConnector(account).createDraft({ to: d.toEmail, subject: d.subject, body: d.body, providerThreadId: thread.providerThreadId, inReplyTo: last?.headers?.["message-id"] });
      await db.update(followUpDrafts).set({ status: "gmail_draft_created", providerDraftId: draftId, updatedAt: new Date() }).where(eq(followUpDrafts.id, d.id));
      await audit({ workspaceId: auth.workspace.id, userId: auth.user.id, action: "draft.provider_created", targetType: "follow_up_draft", targetId: d.id, metadata: { provider: account.provider } });
      return json({ ok: true, providerDraftId: draftId, demo: account.provider === "demo", openUrl: account.provider === "gmail" ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(account.email)}#drafts` : null });
    } catch (e) {
      throw new HttpError(502, `Could not create draft in mailbox: ${e instanceof Error ? e.message : "error"}`);
    }
  },
  { limit: 20 },
);
