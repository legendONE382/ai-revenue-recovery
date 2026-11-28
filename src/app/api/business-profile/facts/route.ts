import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { businessProfileFacts } from "@/db/schema";
import { HttpError, json, parseBody, withAuth } from "@/lib/http";

const FactAction = z.object({
  id: z.string().uuid(),
  action: z.enum(["confirm", "reject", "correct"]),
  value: z.string().max(500).optional(),
});

export const PATCH = withAuth(async (req, auth) => {
  const body = await parseBody(req, FactAction);
  const [existing] = await db.select().from(businessProfileFacts).where(and(eq(businessProfileFacts.id, body.id), eq(businessProfileFacts.workspaceId, auth.workspace.id)));
  if (!existing) throw new HttpError(404, "Fact not found");
  const status = body.action === "confirm" ? "confirmed" : body.action === "reject" ? "rejected" : "confirmed";
  const [row] = await db.update(businessProfileFacts).set({
    status,
    value: body.action === "correct" && body.value ? body.value : existing.value,
    source: body.action === "correct" ? "user" : existing.source,
    updatedAt: new Date(),
  }).where(eq(businessProfileFacts.id, body.id)).returning();
  return json({ fact: row });
});
