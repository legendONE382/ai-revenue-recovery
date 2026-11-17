import crypto from "node:crypto";

/**
 * Google OAuth 2.0 (authorization code + PKCE, offline access).
 *
 * Scopes:
 *  - gmail.readonly  (RESTRICTED) — required to read full threads for inbox-wide analysis.
 *  - gmail.compose   (RESTRICTED) — required ONLY to create drafts (never used to send).
 *  - openid email    — to identify the connected mailbox.
 * Restricted scopes require Google OAuth verification + an annual CASA security assessment
 * before public launch. Until then the app works only for test users listed in the
 * Google Cloud console (max 100). See README › Google verification.
 */
export const GMAIL_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  ...(process.env.GMAIL_ENABLE_DRAFTS === "0" ? [] : ["https://www.googleapis.com/auth/gmail.compose"]),
];

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_URL);
}

export function redirectUri(): string {
  return `${process.env.APP_URL!.replace(/\/$/, "")}/api/integrations/google/callback`;
}

export function pkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthUrl(state: string, codeChallenge: string, loginHint?: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope: string; id_token?: string };

export async function exchangeCode(code: string, verifier: string, fetchFn: typeof fetch = fetch): Promise<TokenResponse> {
  const res = await fetchFn("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (HTTP ${res.status})`);
  return (await res.json()) as TokenResponse;
}

export class TokenRevokedError extends Error {}

export async function refreshAccessToken(refreshToken: string, fetchFn: typeof fetch = fetch): Promise<TokenResponse> {
  const res = await fetchFn("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (res.status === 400 || res.status === 401) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (body.error === "invalid_grant") throw new TokenRevokedError("Google access was revoked or expired");
  }
  if (!res.ok) throw new Error(`Token refresh failed (HTTP ${res.status})`);
  return (await res.json()) as TokenResponse;
}

export async function revokeToken(token: string, fetchFn: typeof fetch = fetch): Promise<void> {
  await fetchFn(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}
