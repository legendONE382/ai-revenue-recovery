import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { aiProviderKeys, notificationPreferences, notifications, workspaces } from "@/db/schema";
import { audit } from "@/lib/audit";
import { encrypt, isEncryptionConfigured } from "@/lib/crypto";
import { HttpError, json, parseBody, withAuth } from "@/lib/http";

const Settings = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  settings: z
    .object({
      onboardingComplete: z.boolean(),
      aiProcessingAllowed: z.boolean(),
      aiProviderOrder: z.array(z.enum(["gemini", "groq", "mistral", "openai"])).max(4),
      monitoringDays: z.number().int().min(7).max(365),
      leadResponseHours: z.number().int().min(1).max(168),
      proposalInactivityDays: z.number().int().min(1).max(60),
      paymentGraceDays: z.number().int().min(0).max(60),
      followUpDays: z.number().int().min(1).max(30),
      retentionDays: z.number().int().min(30).max(730),
      signature: z.string().max(500),
    })
    .partial()
    .optional(),
  notifications: z
    .object({ newOpportunity: z.boolean(), overdueFollowUp: z.boolean(), proposalInactivity: z.boolean(), paymentReminder: z.boolean(), dailySummary: z.boolean(), emailNotifications: z.boolean(), minPriority: z.number().int().min(0).max(100) })
    .partial()
    .optional(),
  aiKey: z.object({ provider: z.enum(["gemini", "groq", "mistral", "openai"]), apiKey: z.string().max(300).nullable(), model: z.string().max(100).optional() }).optional(),
  markNotificationsRead: z.boolean().optional(),
});

export const PATCH = withAuth(async (req, auth) => {
  const body = await parseBody(req, Settings);
  if (body.settings || body.name) {
    const merged = { ...auth.workspace.settings, ...(body.settings ?? {}) };
    await db.update(workspaces).set({ settings: merged, ...(body.name ? { name: body.name } : {}) }).where(eq(workspaces.id, auth.workspace.id));
    if (body.settings?.aiProcessingAllowed !== undefined && body.settings.aiProcessingAllowed !== auth.workspace.settings.aiProcessingAllowed) {
      await audit({ workspaceId: auth.workspace.id, userId: auth.user.id, action: body.settings.aiProcessingAllowed ? "privacy.ai_processing_enabled" : "privacy.ai_processing_disabled" });
    }
  }
  if (body.notifications) {
    await db.insert(notificationPreferences).values({ workspaceId: auth.workspace.id, ...body.notifications }).onConflictDoUpdate({ target: notificationPreferences.workspaceId, set: body.notifications });
  }
  if (body.aiKey) {
    if (body.aiKey.apiKey === null || body.aiKey.apiKey === "") {
      await db.delete(aiProviderKeys).where(and(eq(aiProviderKeys.workspaceId, auth.workspace.id), eq(aiProviderKeys.provider, body.aiKey.provider)));
    } else {
      if (!isEncryptionConfigured()) throw new HttpError(503, "Server encryption key not configured; cannot store API keys");
      const keyEnc = encrypt(body.aiKey.apiKey, `aikey:${auth.workspace.id}:${body.aiKey.provider}`);
      await db
        .insert(aiProviderKeys)
        .values({ workspaceId: auth.workspace.id, provider: body.aiKey.provider, keyEnc, model: body.aiKey.model || null })
        .onConflictDoUpdate({ target: [aiProviderKeys.workspaceId, aiProviderKeys.provider], set: { keyEnc, model: body.aiKey.model || null } });
    }
    await audit({ workspaceId: auth.workspace.id, userId: auth.user.id, action: "ai_key.updated", metadata: { provider: body.aiKey.provider, removed: !body.aiKey.apiKey } });
  }
  if (body.markNotificationsRead) {
    await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.workspaceId, auth.workspace.id));
  }
  return json({ ok: true });
});
