import crypto from "node:crypto";

/**
 * Verifies the OIDC JWT that Google Cloud Pub/Sub attaches to authenticated push requests
 * (Authorization: Bearer <jwt>). Checks RS256 signature against Google's JWKS, issuer,
 * audience, expiry and (optionally) the push service-account email.
 */
export type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string };
type KeyFetcher = () => Promise<Jwk[]>;

let cache: { keys: Jwk[]; at: number } | null = null;
export const fetchGoogleKeys: KeyFetcher = async () => {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.keys;
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!res.ok) throw new Error("Unable to fetch Google signing keys");
  const data = (await res.json()) as { keys: Jwk[] };
  cache = { keys: data.keys, at: Date.now() };
  return data.keys;
};

export type JwtClaims = { iss: string; aud: string; exp: number; iat: number; email?: string; email_verified?: boolean };

export async function verifyGoogleJwt(
  token: string,
  opts: { audience: string; serviceAccountEmail?: string; getKeys?: KeyFetcher; now?: number },
): Promise<JwtClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");
  const [h, p, s] = parts;
  const header = JSON.parse(Buffer.from(h, "base64url").toString()) as { alg: string; kid: string };
  if (header.alg !== "RS256") throw new Error("Unexpected JWT algorithm");
  const keys = await (opts.getKeys ?? fetchGoogleKeys)();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Unknown signing key");
  const key = crypto.createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: "jwk" });
  const ok = crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"));
  if (!ok) throw new Error("Invalid JWT signature");
  const claims = JSON.parse(Buffer.from(p, "base64url").toString()) as JwtClaims;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (!["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)) throw new Error("Invalid issuer");
  if (claims.aud !== opts.audience) throw new Error("Invalid audience");
  if (claims.exp < now - 60) throw new Error("JWT expired");
  if (opts.serviceAccountEmail && (claims.email !== opts.serviceAccountEmail || claims.email_verified === false)) throw new Error("Unexpected service account");
  return claims;
}

/** Decodes the Pub/Sub push envelope carrying a Gmail notification. */
export function decodeGmailNotification(body: unknown): { emailAddress: string; historyId: string; messageId: string } | null {
  const b = body as { message?: { data?: string; messageId?: string; message_id?: string } };
  if (!b?.message?.data) return null;
  try {
    const data = JSON.parse(Buffer.from(b.message.data, "base64").toString()) as { emailAddress?: string; historyId?: string | number };
    if (!data.emailAddress || !data.historyId) return null;
    return { emailAddress: data.emailAddress.toLowerCase(), historyId: String(data.historyId), messageId: b.message.messageId ?? b.message.message_id ?? "" };
  } catch {
    return null;
  }
}
