import { z } from "zod";
import { askAssistant } from "@/lib/agents/assistant";
import { json, parseBody, withAuth } from "@/lib/http";

export const POST = withAuth(
  async (req, auth) => {
    const { question } = await parseBody(req, z.object({ question: z.string().trim().min(2).max(1000) }));
    const reply = await askAssistant(auth.workspace.id, question);
    return json(reply);
  },
  { limit: 30 },
);
