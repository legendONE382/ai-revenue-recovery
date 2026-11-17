import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { randomToken, sha256 } from "@/lib/crypto";
import { isEncryptionConfigured } from "@/lib/crypto";
import { buildAuthUrl, googleConfigured, pkcePair } from "@/lib/gmail/oauth";

const OAUTH_COOKIE = "iri_oauth";

export async function GET(req: Request) {
  const auth = await getAuth();
  const base = new URL(req.url);
  if (!auth) return NextResponse.redirect(new URL("/login", base));
  if (!googleConfigured() || !isEncryptionConfigured()) {
    return NextResponse.redirect(new URL("/app/integrations?error=google_not_configured", base));
  }
  const state = randomToken(24);
  const { verifier, challenge } = pkcePair();
  const jar = await cookies();
  // State is bound to the current session (hash) to prevent login-CSRF / account mix-ups.
  jar.set(OAUTH_COOKIE, JSON.stringify({ s: state, v: verifier, sid: sha256(auth.sessionId) }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    sameSite: "lax",
    path: "/api/integrations/google",
    maxAge: 600,
  });
  return NextResponse.redirect(buildAuthUrl(state, challenge, auth.user.email));
}
