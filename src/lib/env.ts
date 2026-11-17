import { isEncryptionConfigured } from "./crypto";

/**
 * Central view of which features this deployment has configured. Used by the startup check
 * (instrumentation.ts), the Settings › Deployment status panel and feature gating.
 * Never returns secret values — only booleans and non-sensitive identifiers.
 */
export type ConfigCheck = { key: string; label: string; ok: boolean; required: boolean; hint: string };

export function appUrl(): string | null {
  const u = process.env.APP_URL?.trim().replace(/\/$/, "");
  return u ? u : null;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function configChecks(): ConfigCheck[] {
  const url = appUrl();
  const httpsOk = !url || url.startsWith("https://") || url.startsWith("http://localhost");
  return [
    { key: "DATABASE_URL", label: "Database", ok: Boolean(process.env.DATABASE_URL), required: true, hint: "Postgres connection string." },
    { key: "APP_URL", label: "Public URL", ok: Boolean(url) && httpsOk, required: true, hint: url && !httpsOk ? "APP_URL must use https:// in production." : "e.g. https://revenue.yourdomain.com — used for OAuth redirects and email links." },
    { key: "TOKEN_ENCRYPTION_KEY", label: "Encryption key", ok: isEncryptionConfigured(), required: true, hint: "32-byte key (base64 or hex). Run: node scripts/generate-secrets.mjs" },
    { key: "CRON_SECRET", label: "Scheduler secret", ok: (process.env.CRON_SECRET?.length ?? 0) >= 16, required: true, hint: "At least 16 characters. Protects /api/cron/tick." },
    { key: "GOOGLE_CLIENT_ID", label: "Google OAuth", ok: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), required: false, hint: "Needed to connect real Gmail accounts (demo mode works without it)." },
    { key: "GMAIL_PUBSUB_TOPIC", label: "Gmail push (Pub/Sub)", ok: Boolean(process.env.GMAIL_PUBSUB_TOPIC && (process.env.PUBSUB_AUDIENCE || process.env.PUBSUB_VERIFICATION_TOKEN)), required: false, hint: "Optional real-time updates. Without it, the scheduler polls every 15 minutes." },
    { key: "RESEND_API_KEY", label: "Email delivery", ok: emailConfigured(), required: false, hint: "RESEND_API_KEY + EMAIL_FROM. Enables password reset and notification emails." },
    {
      key: "AI",
      label: "Managed AI provider",
      ok: Boolean(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.MISTRAL_API_KEY || process.env.OPENAI_API_KEY),
      required: false,
      hint: "Optional. Users can also add their own keys in Settings. AI is used only when a workspace opts in.",
    },
  ];
}

export function missingRequired(): string[] {
  return configChecks()
    .filter((c) => c.required && !c.ok)
    .map((c) => c.key);
}
