import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { notificationPreferences, sessions, users, workspaces, type WorkspaceSettings } from "@/db/schema";
import { hashPassword, randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "iri_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export type AuthContext = {
  user: { id: string; email: string; name: string | null };
  workspace: { id: string; name: string; settings: WorkspaceSettings };
  sessionId: string;
};

export async function createUser(email: string, password: string, name: string | null) {
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email: email.toLowerCase(), passwordHash, name }).returning();
    const [ws] = await tx
      .insert(workspaces)
      .values({ ownerUserId: user.id, name: name ? `${name}'s workspace` : "My workspace", settings: {} })
      .returning();
    await tx.insert(notificationPreferences).values({ workspaceId: ws.id });
    return { user, workspace: ws };
  });
}

export async function createSession(userId: string) {
  const token = randomToken(32);
  const h = await headers();
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

export async function getAuth(): Promise<AuthContext | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      wsId: workspaces.id,
      wsName: workspaces.name,
      settings: workspaces.settings,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(workspaces, eq(workspaces.ownerUserId, users.id))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    sessionId: r.sessionId,
    user: { id: r.userId, email: r.email, name: r.name },
    workspace: { id: r.wsId, name: r.wsName, settings: r.settings ?? {} },
  };
}

/** For server components/pages. */
export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  return auth;
}
