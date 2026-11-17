import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { digestEmail, passwordResetEmail, sendEmail } from "@/lib/email";
import { configChecks, missingRequired } from "@/lib/env";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("email delivery", () => {
  it("does nothing when no provider is configured", async () => {
    delete process.env.RESEND_API_KEY;
    const f = vi.fn();
    expect(await sendEmail({ to: "a@b.com", subject: "s", text: "t", html: "h" }, f as unknown as typeof fetch)).toMatchObject({ sent: false });
    expect(f).not.toHaveBeenCalled();
  });
  it("sends via the Resend API with auth and sender", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "App <n@x.com>";
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    const r = await sendEmail({ to: "a@b.com", subject: "s", text: "t", html: "h" }, f as unknown as typeof fetch);
    expect(r).toEqual({ sent: true, id: "em_1" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body as string)).toMatchObject({ from: "App <n@x.com>", to: ["a@b.com"] });
  });
  it("reports provider failures without throwing", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "n@x.com";
    const r = await sendEmail({ to: "a@b.com", subject: "s", text: "t", html: "h" }, (async () => new Response("no", { status: 422 })) as unknown as typeof fetch);
    expect(r).toMatchObject({ sent: false, error: "Email provider HTTP 422" });
  });
  it("escapes untrusted text in digest HTML", () => {
    process.env.APP_URL = "https://app.example.com";
    const m = digestEmail("a@b.com", [{ title: '<script>alert(1)</script> from "Eve"', body: "Reply <b>now</b>", href: "/app/opportunities/1" }]);
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.text).toContain("https://app.example.com/app/opportunities/1");
  });
  it("password reset email contains the link and expiry", () => {
    const m = passwordResetEmail("a@b.com", "https://app/reset-password?token=abc");
    expect(m.text).toContain("https://app/reset-password?token=abc");
    expect(m.text).toMatch(/1 hour/);
  });
});

describe("deployment configuration checks", () => {
  it("flags missing required secrets", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.CRON_SECRET;
    delete process.env.APP_URL;
    expect(missingRequired()).toEqual(expect.arrayContaining(["TOKEN_ENCRYPTION_KEY", "CRON_SECRET", "APP_URL"]));
  });
  it("passes when required values are valid and rejects non-https public URLs", () => {
    process.env.DATABASE_URL = "postgres://x";
    process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    process.env.CRON_SECRET = "a".repeat(32);
    process.env.APP_URL = "https://revenue.example.com/";
    expect(missingRequired()).toEqual([]);
    process.env.APP_URL = "http://revenue.example.com";
    expect(missingRequired()).toContain("APP_URL");
    expect(JSON.stringify(configChecks())).not.toContain(process.env.CRON_SECRET);
  });
  it("rejects malformed encryption keys and short cron secrets", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "too-short";
    process.env.CRON_SECRET = "short";
    expect(missingRequired()).toEqual(expect.arrayContaining(["TOKEN_ENCRYPTION_KEY", "CRON_SECRET"]));
  });
});
