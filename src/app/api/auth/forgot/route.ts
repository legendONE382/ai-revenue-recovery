import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { randomToken, sha256 } from "@/lib/crypto";
import { passwordResetEmail, sendEmail } from "@/lib/email";
import { appUrl, emailConfigured } from "@/lib/env";
import { assertSameOrigin, clientIp, errorResponse, json, parseBody, rateLimit } from "@/lib/http";

/** Always responds identically whether or not the account exists (no user enumeration). */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const ip = clientIp(req);
    await rateLimit(`forgot:${ip}`, 5, 900);
    const { email } = await parseBody(req, z.object({ email: z.string().email().max(200) }));
    await rateLimit(`forgot-email:${email.toLowerCase()}`, 3, 3600);
    const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, email.toLowerCase()));
    if (user && emailConfigured()) {
      const token = randomToken(32);
      await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) });
      const base = appUrl() ?? new URL(req.url).origin;
      const r = await sendEmail(passwordResetEmail(user.email, `${base}/reset-password?token=${encodeURIComponent(token)}`));
      await audit({ userId: user.id, action: r.sent ? "auth.password_reset_requested" : "auth.password_reset_email_failed", ip, metadata: r.error ? { error: r.error } : undefined });
    }
    return json({ ok: true, emailEnabled: emailConfigured() });
  } catch (e) {
    return errorResponse(e);
  }
}
