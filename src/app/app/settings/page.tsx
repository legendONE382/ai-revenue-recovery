import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiProviderKeys, notificationPreferences } from "@/db/schema";
import { AccountForm } from "@/components/account-form";
import { SettingsForms } from "@/components/settings-forms";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { isEncryptionConfigured } from "@/lib/crypto";
import { emailConfigured } from "@/lib/env";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const auth = await requireAuth();
  const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.workspaceId, auth.workspace.id));
  const keys = await db.select({ provider: aiProviderKeys.provider, model: aiProviderKeys.model }).from(aiProviderKeys).where(eq(aiProviderKeys.workspaceId, auth.workspace.id));
  const managed = (["gemini", "groq", "mistral", "openai"] as const).filter((p) => !!process.env[`${p.toUpperCase()}_API_KEY`]);

  return (
    <>
      <PageHeader title="Settings" subtitle="Account, detection thresholds, privacy, AI providers, notifications and your data." />
      <div className="mb-4"><a href="/app/settings/business-profile" className="text-sm text-emerald-700 underline">Manage business profile →</a></div>
      <div className="space-y-6">
        <AccountForm name={auth.user.name} email={auth.user.email} />
        <SettingsForms
          name={auth.workspace.name}
          settings={auth.workspace.settings}
          prefs={prefs ?? { newOpportunity: true, overdueFollowUp: true, proposalInactivity: true, paymentReminder: true, dailySummary: true, emailNotifications: true, minPriority: 30 }}
          keys={keys}
          managedProviders={managed}
          encryptionReady={isEncryptionConfigured()}
          emailReady={emailConfigured()}
        />
      <Card>
        <CardHeader title="About & support" hint="Information about your account and data" />
        <div className="space-y-3 p-5 text-sm text-stone-600">
          <p>Your data is encrypted and stored securely. You can export or delete your data at any time from the &ldquo;Your data&rdquo; section above.</p>
          <p>For questions or support, contact us through the app. Read our <Link href="/privacy" className="underline">privacy policy</Link> and <Link href="/terms" className="underline">terms of service</Link> for more details.</p>
        </div>
      </Card>
      </div>
    </>
  );
}
