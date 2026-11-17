import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createSession, createUser } from "@/lib/auth";
import { assertSameOrigin, clientIp, errorResponse, HttpError, json, parseBody, rateLimit } from "@/lib/http";

const Body = z.object({
  email: z.string().email().max(200),
  password: z.string().min(10, "Password must be at least 10 characters").max(200),
  name: z.string().trim().max(100).optional(),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const ip = clientIp(req);
    await rateLimit(`register:${ip}`, 5, 600);
    const body = await parseBody(req, Body);
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email.toLowerCase()));
    if (existing) throw new HttpError(409, "An account with this email already exists");
    const { user, workspace } = await createUser(body.email, body.password, body.name || null);
    await createSession(user.id);
    await audit({ workspaceId: workspace.id, userId: user.id, action: "account.created", ip });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
