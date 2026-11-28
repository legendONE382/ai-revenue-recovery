import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { emailIntelligence, emailMessages } from "@/db/schema";
import { HttpError, json, parseBody, withAuth } from "@/lib/http";

const Query = z.object({ messageId: z.string().uuid().optional(), threadId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(200).optional() });

export const GET = withAuth(async (req, auth) => {
  const url = new URL(req.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw new HttpError(400, "bad query");
  const { messageId, threadId, limit } = parsed.data;
  const conds = [eq(emailIntelligence.workspaceId, auth.workspace.id)];
  if (messageId) conds.push(eq(emailIntelligence.messageId, messageId));
  if (threadId) conds.push(eq(emailIntelligence.threadId, threadId));
  const rows = await db.select().from(emailIntelligence).where(and(...conds)).orderBy(desc(emailIntelligence.analysedAt)).limit(limit ?? 100);
  return json({ intelligence: rows });
});
