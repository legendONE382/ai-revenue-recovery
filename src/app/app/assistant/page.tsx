import { AssistantChat } from "@/components/assistant-chat";
import { PageHeader } from "@/components/ui";
import { aiAvailable } from "@/lib/ai";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const auth = await requireAuth();
  const ai = await aiAvailable(auth.workspace.id, "assistant");
  return (
    <>
      <PageHeader title="AI Assistant" subtitle="Ask questions about your commercial conversations. Every answer is based on your actual findings — it won't invent figures or claim actions it hasn't taken." />
      <AssistantChat aiEnabled={ai} />
    </>
  );
}
