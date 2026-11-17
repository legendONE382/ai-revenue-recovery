import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { passwordResetTokens, sessions, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createSession } from "@/lib/auth";
import { hashPassword, sha256 } from "@/lib/crypto";
import { HttpError, assertSameOrigin, clientIp, errorResponse, json, parseBody, rateLimit } from "@/lib/http";

const Body = z.object({ token: z.string().min(20).max(200), password: z.string().min(10, "Password must be at least 10 characters").max(200) });

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const ip = clientIp(req);
    await rateLimit(`reset:${ip}`, 10, 900);
    const { token, password } = await parseBody(req, Body);
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, sha256(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())));
    if (!row) throw new HttpError(400, "This reset link is invalid or has expired. Please request a new one.");
    const passwordHash = await hashPassword(password);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
      await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.userId, row.userId));
      await tx.delete(sessions).where(eq(sessions.userId, row.userId)); // sign out everywhere
    });
    await createSession(row.userId);
    await audit({ userId: row.userId, action: "auth.password_reset_completed", ip });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
