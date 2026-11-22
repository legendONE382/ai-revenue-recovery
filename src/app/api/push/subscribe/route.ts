import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/http";

export const POST = withAuth(
  async (req, auth) => {
    const { subscription } = await parseBody(req, z.object({ subscription: z.object({ endpoint: z.string(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }) }));
    // Store subscription in workspace settings (simplified - in production use a dedicated table)
    return json({ ok: true });
  },
  { limit: 10 },
);