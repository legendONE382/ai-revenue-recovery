import { z } from "zod";
import { generateDraft } from "@/lib/agents/recovery";
import { audit } from "@/lib/audit";
import { HttpError, json, parseBody, withAuth } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth<Ctx>(
  async (req, auth, { params }) => {
    const { id } = await params;
    const { kind } = await parseBody(req, z.object({ kind: z.enum(["lead_reply", "proposal_followup", "payment_reminder", "client_checkin", "renewal_reminder"]).optional() }));
    try {
      const { draft } = await generateDraft(auth.workspace.id, id, kind);
      await audit({ workspaceId: auth.workspace.id, userId: auth.user.id, action: "draft.generated", targetType: "follow_up_draft", targetId: draft.id, metadata: { generatedBy: draft.generatedBy } });
      return json({ draft });
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "Could not generate draft");
    }
  },
  { limit: 20 },
);
