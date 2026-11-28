import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { businessInsights } from "@/db/schema";
import { HttpError, json, parseBody, withAuth } from "@/lib/http";

const Action = z.object({ id: z.string().uuid(), status: z.enum(["active", "dismissed", "corrected"]) });

export const GET = withAuth(async (_req, auth) => {
  const rows = await db.select().from(businessInsights).where(eq(businessInsights.workspaceId, auth.workspace.id)).orderBy(businessInsights.lastUpdatedAt);
  return json({ insights: rows });
});

export const PATCH = withAuth(async (req, auth) => {
  const body = await parseBody(req, Action);
  const [existing] = await db.select().from(businessInsights).where(and(eq(businessInsights.id, body.id), eq(businessInsights.workspaceId, auth.workspace.id)));
  if (!existing) throw new HttpError(404, "Insight not found");
  const [row] = await db.update(businessInsights).set({ status: body.status, lastUpdatedAt: new Date() }).where(eq(businessInsights.id, body.id)).returning();
  return json({ insight: row });
});
