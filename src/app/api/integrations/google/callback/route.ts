import { cookies } from "next/headers";
import { NextResponse, after } from "next/server";
import { db } from "@/db";
import { connectedAccounts, encryptedOauthTokens, syncState } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getAuth } from "@/lib/auth";
import { encrypt, safeEqual, sha256 } from "@/lib/crypto";
import { GmailClient } from "@/lib/gmail/client";
import { exchangeCode } from "@/lib/gmail/oauth";
import { enqueue } from "@/lib/jobs/queue";
import { runWorker } from "@/lib/jobs/worker";
import { clientIp } from "@/lib/http";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (code: string) => NextResponse.redirect(new URL(`/app/integrations?error=${code}`, url));
  const auth = await getAuth();
  if (!auth) return NextResponse.redirect(new URL("/login", url));
  const jar = await cookies();
  const raw = jar.get("iri_oauth")?.value;
  jar.delete({ name: "iri_oauth", path: "/api/integrations/google" });
  if (url.searchParams.get("error")) return fail("access_denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!raw || !code || !state) return fail("invalid_state");
  let saved: { s: string; v: string; sid: string };
  try {
    saved = JSON.parse(raw);
  } catch {
    return fail("invalid_state");
  }
  if (!safeEqual(saved.s, state) || !safeEqual(saved.sid, sha256(auth.sessionId))) return fail("invalid_state");

  try {
    const tokens = await exchangeCode(code, saved.v);
    if (!tokens.scope.includes("gmail.readonly")) return fail("missing_scope");
    const profile = await new GmailClient(async () => tokens.access_token).getProfile();
    const email = profile.emailAddress.toLowerCase();
    const [account] = await db
      .insert(connectedAccounts)
      .values({ workspaceId: auth.workspace.id, provider: "gmail", email, status: "active", scopes: tokens.scope })
      .onConflictDoUpdate({ target: [connectedAccounts.workspaceId, connectedAccounts.provider, connectedAccounts.email], set: { status: "active", statusMessage: null, scopes: tokens.scope } })
      .returning();
    const aad = `oauth:${account.id}`;
    const values = {
      connectedAccountId: account.id,
      accessTokenEnc: encrypt(tokens.access_token, aad),
      refreshTokenEnc: tokens.refresh_token ? encrypt(tokens.refresh_token, aad) : null,
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      updatedAt: new Date(),
    };
    await db
      .insert(encryptedOauthTokens)
      .values(values)
      .onConflictDoUpdate({ target: encryptedOauthTokens.connectedAccountId, set: tokens.refresh_token ? values : { accessTokenEnc: values.accessTokenEnc, accessTokenExpiresAt: values.accessTokenExpiresAt, updatedAt: values.updatedAt } });
    await db.insert(syncState).values({ connectedAccountId: account.id }).onConflictDoNothing();
    await enqueue("initial_sync", { accountId: account.id }, { workspaceId: auth.workspace.id, idempotencyKey: `initial:${account.id}:start:${Date.now()}` });
    await audit({ workspaceId: auth.workspace.id, userId: auth.user.id, action: "gmail.connected", targetType: "connected_account", targetId: account.id, metadata: { email, scopes: tokens.scope }, ip: clientIp(req) });
    after(() => runWorker({ budgetMs: 8_000 }).catch(() => undefined));
    return NextResponse.redirect(new URL(`/app/integrations?connected=${encodeURIComponent(email)}`, url));
  } catch (e) {
    console.error("[oauth] callback failed:", e instanceof Error ? e.message : "unknown");
    return fail("exchange_failed");
  }
}
