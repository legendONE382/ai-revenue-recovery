import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contacts, emailThreads, opportunities, reminders, userFeedback } from "@/db/schema";
import { audit } from "@/lib/audit";
import { HttpError, json, parseBody, withAuth } from "@/lib/http";
import { scoreOpportunity } from "@/lib/intel/score";
import type { OpportunityCategory } from "@/lib/intel/types";

type Ctx = { params: Promise<{ id: string }> };

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dismiss"), suppressSender: z.boolean().optional(), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("resolve"), resolution: z.enum(["won", "lost", "paid", "handled"]), recoveredAmount: z.number().nonnegative().max(1e9).optional() }),
  z.object({ action: z.literal("snooze"), until: z.string().datetime() }),
  z.object({ action: z.literal("reopen") }),
  z.object({
    action: z.literal("correct"),
    amount: z.number().nonnegative().max(1e9).nullable().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    stage: z.enum(["new", "contacted", "proposal_sent", "negotiating", "invoiced", "won", "lost", "dormant", "paid"]).optional(),
  }),
]);

/**
 * User feedback actions. Feedback is persisted (user_feedback) and changes later processing:
 *  - dismiss → not re-raised unless newer messages arrive; optional sender suppression
 *  - correct → user amount/stage overrides survive every re-analysis
 */
export const PATCH = withAuth<Ctx>(async (req, auth, { params }) => {
  const { id } = await params;
  const [opp] = await db.select().from(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.workspaceId, auth.workspace.id)));
  if (!opp) throw new HttpError(404, "Opportunity not found");
  const body = await parseBody(req, Action);
  const now = new Date();
  const fb = (kind: string, field?: string, oldValue?: string | null, newValue?: string | null) =>
    db.insert(userFeedback).values({ workspaceId: auth.workspace.id, opportunityId: opp.id, kind, field, oldValue: oldValue ?? null, newValue: newValue ?? null });

  switch (body.action) {
    case "dismiss": {
      const [t] = await db.select({ last: emailThreads.lastMessageAt }).from(emailThreads).where(eq(emailThreads.id, opp.threadId));
      await db.update(opportunities).set({ status: "dismissed", dismissedAtMessage: t?.last ?? now, updatedAt: now }).where(eq(opportunities.id, opp.id));
      await fb("false_positive", "category", opp.category, body.reason ?? null);
      if (body.suppressSender && opp.contactId) {
        await db.update(contacts).set({ suppressed: true }).where(and(eq(contacts.id, opp.contactId), eq(contacts.workspaceId, auth.workspace.id)));
        await fb("suppress_sender", "contact", null, opp.contactId);
      }
      break;
    }
    case "resolve": {
      const recovered = body.resolution === "paid" ? (body.recoveredAmount !== undefined ? Math.round(body.recoveredAmount * 100) : opp.amountCents) : null;
      await db
        .update(opportunities)
        .set({ status: "resolved", resolution: body.resolution, resolvedAt: now, updatedAt: now, recoveredAmountCents: recovered, stage: body.resolution === "handled" ? opp.stage : body.resolution })
        .where(eq(opportunities.id, opp.id));
      await db.update(reminders).set({ status: "cancelled" }).where(and(eq(reminders.opportunityId, opp.id), eq(reminders.status, "pending")));
      await fb("resolved", "resolution", null, body.resolution);
      break;
    }
    case "snooze": {
      const until = new Date(body.until);
      if (until <= now) throw new HttpError(400, "Snooze date must be in the future");
      await db.update(opportunities).set({ status: "snoozed", snoozedUntil: until, updatedAt: now }).where(eq(opportunities.id, opp.id));
      await db.insert(reminders).values({ workspaceId: auth.workspace.id, opportunityId: opp.id, remindAt: until, reason: "Snoozed opportunity is due for review" });
      await fb("snoozed", "snoozedUntil", null, until.toISOString());
      break;
    }
    case "reopen":
      await db.update(opportunities).set({ status: "open", resolution: null, resolvedAt: null, snoozedUntil: null, dismissedAtMessage: null, updatedAt: now }).where(eq(opportunities.id, opp.id));
      await fb("reopened");
      break;
    case "correct": {
      const overrides = { ...(opp.userOverrides ?? {}) };
      const patch: Partial<typeof opportunities.$inferInsert> = { updatedAt: now };
      if (body.amount !== undefined) {
        patch.amountCents = body.amount === null ? null : Math.round(body.amount * 100);
        patch.currency = body.currency ?? opp.currency ?? "USD";
        patch.amountSource = "user";
        await fb("correction", "amount", opp.amountCents?.toString() ?? null, patch.amountCents?.toString() ?? null);
      }
      if (body.stage) {
        overrides.stage = body.stage;
        patch.stage = body.stage;
        await fb("correction", "stage", opp.stage, body.stage);
      }
      patch.userOverrides = overrides;
      const { score, factors } = scoreOpportunity({
        category: opp.category as OpportunityCategory,
        amountCents: patch.amountCents !== undefined ? patch.amountCents : opp.amountCents,
        currency: (patch.currency as string | undefined) ?? opp.currency,
        confidence: opp.confidence,
        lastInteractionAt: opp.lastInteractionAt ?? now,
        dueDate: opp.dueDate,
        messageCount: 3,
        now,
      });
      patch.priorityScore = score;
      patch.priorityFactors = factors;
      await db.update(opportunities).set(patch).where(eq(opportunities.id, opp.id));
      break;
    }
  }
  await audit({ workspaceId: auth.workspace.id, userId: auth.user.id, action: `opportunity.${body.action}`, targetType: "opportunity", targetId: opp.id });
  return json({ ok: true });
});
