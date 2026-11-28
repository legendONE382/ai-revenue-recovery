import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { businessOfferings, businessProfiles } from "@/db/schema";
import { HttpError, json, parseBody, withAuth } from "@/lib/http";

const OfferingInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().max(120).optional(),
  targetCustomer: z.string().max(200).optional(),
  priceRange: z.string().max(120).optional(),
  currency: z.string().max(12).optional(),
  keywords: z.array(z.string().max(80)).max(50).optional(),
  active: z.boolean().optional(),
});

export const POST = withAuth(async (req, auth) => {
  const body = await parseBody(req, OfferingInput);
  let [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.workspaceId, auth.workspace.id));
  if (!profile) {
    [profile] = await db.insert(businessProfiles).values({ workspaceId: auth.workspace.id, profileStatus: "draft" }).returning();
  }
  const [row] = await db.insert(businessOfferings).values({
    workspaceId: auth.workspace.id,
    profileId: profile.id,
    name: body.name,
    description: body.description ?? null,
    category: body.category ?? null,
    targetCustomer: body.targetCustomer ?? null,
    priceRange: body.priceRange ?? null,
    currency: body.currency ?? null,
    keywords: body.keywords ?? [],
    active: body.active ?? true,
  }).returning();
  return json({ offering: row }, 201);
});

export const PATCH = withAuth(async (req, auth) => {
  const body = await parseBody(req, OfferingInput.extend({ id: z.string().uuid() }));
  const [existing] = await db.select().from(businessOfferings).where(and(eq(businessOfferings.id, body.id), eq(businessOfferings.workspaceId, auth.workspace.id)));
  if (!existing) throw new HttpError(404, "Offering not found");
  const [row] = await db.update(businessOfferings).set({
    name: body.name,
    description: body.description ?? existing.description,
    category: body.category ?? existing.category,
    targetCustomer: body.targetCustomer ?? existing.targetCustomer,
    priceRange: body.priceRange ?? existing.priceRange,
    currency: body.currency ?? existing.currency,
    keywords: body.keywords ?? existing.keywords,
    active: body.active ?? existing.active,
    updatedAt: new Date(),
  }).where(eq(businessOfferings.id, body.id)).returning();
  return json({ offering: row });
});

export const DELETE = withAuth(async (req, auth) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new HttpError(400, "id required");
  await db.delete(businessOfferings).where(and(eq(businessOfferings.id, id), eq(businessOfferings.workspaceId, auth.workspace.id)));
  return json({ ok: true });
});
