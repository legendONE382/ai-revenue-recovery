import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createSession, destroySession } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { assertSameOrigin, clientIp, errorResponse, HttpError, json, parseBody, rateLimit } from "@/lib/http";

const Body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const ip = clientIp(req);
    await rateLimit(`login:${ip}`, 10, 300);
    const body = await parseBody(req, Body);
    await rateLimit(`login-email:${body.email.toLowerCase()}`, 10, 900);
    const [user] = await db.select().from(users).where(eq(users.email, body.email.toLowerCase()));
    // Constant-ish timing: always run a password verification.
    const ok = user ? await verifyPassword(body.password, user.passwordHash) : (await verifyPassword(body.password, "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==").catch(() => false), false);
    if (!user || !ok) {
      await audit({ action: "auth.login_failed", metadata: { email: body.email.toLowerCase() }, ip });
      throw new HttpError(401, "Invalid email or password");
    }
    await destroySession();
    await createSession(user.id);
    await audit({ userId: user.id, action: "auth.login", ip });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
