import { describe, expect, it } from "vitest";

/**
 * End-to-end HTTP flow against a running server (production build):
 *   E2E_BASE_URL=http://localhost:3000 npx vitest run tests/e2e.flow.test.ts
 * Covers registration → mailbox connection (demo) → synchronisation → detection →
 * draft creation → provider draft → resolution → export → deletion.
 */
const BASE = process.env.E2E_BASE_URL;

describe.skipIf(!BASE)("end-to-end user journey", () => {
  let cookie = "";
  const call = async (path: string, method = "GET", body?: unknown) => {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { origin: BASE!, cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const set = r.headers.get("set-cookie");
    if (set?.includes("iri_session=")) cookie = set.split(";")[0];
    return r;
  };

  it("runs the full journey", async () => {
    const email = `e2e-${Date.now()}@test.local`;
    expect((await call("/api/auth/register", "POST", { email, password: "correct horse battery", name: "E2E User" })).status).toBe(200);
    expect(cookie).toContain("iri_session=");
    expect((await call("/api/settings", "PATCH", { settings: { onboardingComplete: true, monitoringDays: 90 } })).status).toBe(200);

    // CSRF: cross-origin mutation must be rejected
    const evil = await fetch(`${BASE}/api/settings`, { method: "PATCH", headers: { origin: "https://evil.example", cookie, "content-type": "application/json" }, body: "{}" });
    expect(evil.status).toBe(403);

    const demo = await (await call("/api/integrations/demo", "POST", {})).json();
    expect(demo.synced).toBeGreaterThan(20);

    const status = await (await call("/api/status")).json();
    expect(status.openOpportunities).toBeGreaterThanOrEqual(8);

    const ask = await (await call("/api/assistant", "POST", { question: "Which proposals have gone unanswered?" })).json();
    expect(ask.items.length).toBeGreaterThan(0);
    const oppId = ask.items[0].id as string;

    const d = await (await call(`/api/opportunities/${oppId}/drafts`, "POST", {})).json();
    expect(d.draft.body.length).toBeGreaterThan(20);
    const g = await (await call(`/api/drafts/${d.draft.id}`, "POST", {})).json();
    expect(g.demo).toBe(true);

    expect((await call(`/api/opportunities/${oppId}`, "PATCH", { action: "resolve", resolution: "won" })).status).toBe(200);
    const exp = await call("/api/account");
    expect(exp.status).toBe(200);
    const data = await exp.json();
    expect(JSON.stringify(data)).not.toMatch(/access_token_enc|accessTokenEnc|refreshTokenEnc/);

    // Account management + password reset endpoints
    expect((await call("/api/account", "PATCH", { currentPassword: "wrong-password!!", newPassword: "another long password" })).status).toBe(400);
    expect((await call("/api/account", "PATCH", { name: "Renamed User" })).status).toBe(200);
    expect((await call("/api/auth/forgot", "POST", { email })).status).toBe(200);
    expect((await call("/api/auth/forgot", "POST", { email: "nobody@test.local" })).status).toBe(200); // no enumeration
    expect((await call("/api/auth/reset", "POST", { token: "x".repeat(40), password: "a brand new password" })).status).toBe(400);
    for (const p of ["/terms", "/privacy", "/forgot-password", "/robots.txt", "/icon.svg"]) expect((await call(p)).status).toBe(200);
    expect((await call("/definitely-not-a-page")).status).toBe(404);

    expect((await call("/api/account", "DELETE", { confirm: "DELETE" })).status).toBe(200);
    expect((await call("/api/status")).status).toBe(401);
  });
});
