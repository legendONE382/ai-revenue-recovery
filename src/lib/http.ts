import "server-only";
import { sql } from "drizzle-orm";
import type { ZodSchema } from "zod";
import { db } from "@/db";
import { getAuth, type AuthContext } from "./auth";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/**
 * CSRF defence for cookie-authenticated mutations: SameSite=Lax cookies + strict Origin/Referer check.
 */
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) throw new HttpError(403, "Missing origin");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Bad origin");
  }
  const allowed = new Set(
    [req.headers.get("host"), ...(req.headers.get("x-forwarded-host")?.split(",").map((h) => h.trim()) ?? []), process.env.APP_URL ? new URL(process.env.APP_URL).host : null].filter(Boolean),
  );
  if (!allowed.has(originHost)) throw new HttpError(403, "Cross-origin request rejected");
}

/** Fixed-window rate limiter stored in Postgres (works across instances; no Redis needed at this scale). */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const res = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then now() else rate_limits.window_start end
    returning count`);
  const count = Number(res.rows[0]?.count ?? 0);
  if (count > limit) throw new HttpError(429, "Too many requests. Please slow down.");
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  // Limit request body size to 1MB
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > 1_048_576) {
    throw new HttpError(413, "Request body too large");
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return parsed.data;
}

/** Authenticated, CSRF-checked, rate-limited API handler wrapper. */
export function withAuth<C = unknown>(handler: (req: Request, auth: AuthContext, ctx: C) => Promise<Response>, opts: { limit?: number; windowSec?: number } = {}) {
  return async (req: Request, ctx: C) => {
    try {
      assertSameOrigin(req);
      const auth = await getAuth();
      if (!auth) throw new HttpError(401, "Not authenticated");
      // Keyed per method: handlers on the same path (e.g. GET export vs DELETE account) have independent limits.
      await rateLimit(`u:${auth.user.id}:${req.method}:${new URL(req.url).pathname}`, opts.limit ?? 120, opts.windowSec ?? 60);
      return await handler(req, auth, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  // Never leak internal error details to the client
  const message = e instanceof Error ? e.message : "unknown";
  console.error("[api] unhandled error:", message);
  // In production, return a generic message; in development, include the error for debugging
  if (process.env.NODE_ENV === "development") {
    return json({ error: message }, 500);
  }
  return json({ error: "Internal server error" }, 500);
}
