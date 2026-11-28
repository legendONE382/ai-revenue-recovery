import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { businessOfferings, businessProfileFacts, businessProfiles, workspaces } from "@/db/schema";
import { HttpError, json, parseBody, withAuth } from "@/lib/http";

const ProfileInput = z.object({
  businessName: z.string().max(200).optional(),
  businessType: z.string().max(60).optional(),
  industry: z.string().max(120).optional(),
  profession: z.string().max(120).optional(),
  role: z.string().max(120).optional(),
  description: z.string().max(2000).optional(),
  website: z.string().max(300).optional(),
  country: z.string().max(120).optional(),
  location: z.string().max(200).optional(),
  timezone: z.string().max(80).optional(),
  preferredCurrency: z.string().max(12).optional(),
  targetCustomerTypes: z.array(z.string().max(120)).max(50).optional(),
  targetIndustries: z.array(z.string().max(120)).max(50).optional(),
  targetMarkets: z.array(z.string().max(120)).max(50).optional(),
  acceptedEnquiryTypes: z.array(z.string().max(120)).max(50).optional(),
  excludedEnquiryTypes: z.array(z.string().max(120)).max(50).optional(),
  businessGoals: z.array(z.string().max(120)).max(20).optional(),
  inboxPurpose: z.string().max(60).optional(),
  typicalDealSize: z.string().max(120).optional(),
  salesCycle: z.string().max(120).optional(),
  paymentTerms: z.string().max(200).optional(),
  businessHours: z.string().max(200).optional(),
  communicationTone: z.string().max(60).optional(),
  emailSignature: z.string().max(1000).optional(),
  profileStatus: z.enum(["draft", "complete", "skipped"]).optional(),
});

async function getOrCreateProfile(workspaceId: string) {
  let [p] = await db.select().from(businessProfiles).where(eq(businessProfiles.workspaceId, workspaceId));
  if (!p) {
    [p] = await db.insert(businessProfiles).values({ workspaceId, profileStatus: "draft" }).returning();
  }
  return p;
}

export const GET = withAuth(async (_req, auth) => {
  const profile = await getOrCreateProfile(auth.workspace.id);
  const offerings = await db.select().from(businessOfferings).where(eq(businessOfferings.profileId, profile.id)).orderBy(businessOfferings.createdAt);
  const facts = await db.select().from(businessProfileFacts).where(eq(businessProfileFacts.profileId, profile.id)).orderBy(businessProfileFacts.createdAt);
  return json({ profile, offerings, facts });
});

export const PATCH = withAuth(async (req, auth) => {
  const body = await parseBody(req, ProfileInput);
  const profile = await getOrCreateProfile(auth.workspace.id);
  const [updated] = await db.update(businessProfiles).set({ ...body, updatedAt: new Date() }).where(eq(businessProfiles.id, profile.id)).returning();
  // keep workspace name in sync if businessName provided
  if (body.businessName) await db.update(workspaces).set({ name: body.businessName }).where(eq(workspaces.id, auth.workspace.id));
  return json({ profile: updated });
});
