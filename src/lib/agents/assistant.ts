import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { emailThreads, extractedFinancialRecords } from "@/db/schema";
import { runStructured } from "@/lib/ai";
import { ASSISTANT_PROMPT } from "@/lib/ai/prompts";
import { listOpportunities, type OpportunityRow } from "@/lib/data";
import { extractAmounts, formatMoney } from "@/lib/intel/extract";
import { generateDraft } from "./recovery";

export type AssistantItem = { id: string; title: string; category: string; amount: string | null; priority: number; lastInteraction: string | null; href: string };
export type AssistantReply = { answer: string; items: AssistantItem[]; usedAI: string | null; action?: { type: "draft_created"; draftId: string; opportunityId: string } };

const CAT_LABEL: Record<string, string> = { unanswered_lead: "Unanswered lead", proposal_awaiting: "Proposal awaiting reply", payment_followup: "Payment follow-up", client_followup: "Client follow-up" };

function ago(d: Date | null): string {
  if (!d) return "unknown";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

function toItem(o: OpportunityRow): AssistantItem {
  return { id: o.id, title: o.title, category: CAT_LABEL[o.category] ?? o.category, amount: o.amountCents !== null ? formatMoney(o.amountCents, o.currency) : null, priority: o.priorityScore, lastInteraction: ago(o.lastInteractionAt), href: `/app/opportunities/${o.id}` };
}

type Intent = "draft" | "payments" | "proposals" | "leads" | "followups" | "priorities" | "summary" | "search";

export function detectIntent(q: string): Intent {
  const s = q.toLowerCase();
  if (/\b(prepare|draft|write|compose)\b.*\b(follow[- ]?up|reply|reminder|email|message|response)\b/.test(s)) return "draft";
  if (/\b(payment|payments|invoice|invoices|paid|owe|owed|overdue|unpaid)\b/.test(s)) return "payments";
  if (/\b(proposal|proposals|quote|quotes|quotation|estimate)\b/.test(s)) return "proposals";
  if (/\b(lead|leads|enquir|inquir|prospect|potential (client|customer))/.test(s)) return "leads";
  if (/\b(urgent|priorit|today|first|most important)/.test(s)) return "priorities";
  if (/\b(follow[- ]?ups?|need(s)? (a )?(reply|response)|waiting|respond)\b/.test(s)) return "followups";
  if (/\b(summar|overview|outstanding|everything|all)\b/.test(s)) return "summary";
  return "search";
}

function matchOpportunity(q: string, opps: OpportunityRow[]): OpportunityRow | undefined {
  const s = q.toLowerCase();
  let best: { o: OpportunityRow; score: number } | undefined;
  for (const o of opps) {
    const tokens = [o.contactName, o.contactEmail?.split("@")[0], o.companyDomain?.split(".")[0], ...(o.contactName?.split(" ") ?? [])].filter((t): t is string => !!t && t.length > 2).map((t) => t.toLowerCase());
    const score = tokens.filter((t) => s.includes(t)).length;
    if (score > 0 && (!best || score > best.score || (score === best.score && o.priorityScore > best.o.priorityScore))) best = { o, score };
  }
  return best?.o;
}

function list(items: OpportunityRow[], empty: string): string {
  if (items.length === 0) return empty;
  return items
    .slice(0, 8)
    .map((o) => `• ${o.title}${o.amountCents !== null ? ` — ${formatMoney(o.amountCents, o.currency)}` : ""} (last activity ${ago(o.lastInteractionAt)}, priority ${o.priorityScore}). Next: ${o.recommendedAction ?? "review"}`)
    .join("\n");
}

export async function askAssistant(workspaceId: string, question: string): Promise<AssistantReply> {
  const open = await listOpportunities(workspaceId, { status: "open", limit: 200 });
  const intent = detectIntent(question);
  let selected: OpportunityRow[] = [];
  let answer = "";

  if (intent === "draft") {
    const target = matchOpportunity(question, open);
    if (!target) {
      return {
        answer: open.length ? "Which conversation should I draft for? I couldn't match a contact or company name in your request. Try e.g. “Prepare a follow-up for " + (open[0].contactName ?? open[0].contactEmail) + "”." : "There are no open opportunities to draft a follow-up for.",
        items: open.slice(0, 5).map(toItem),
        usedAI: null,
      };
    }
    const { draft } = await generateDraft(workspaceId, target.id);
    return {
      answer: `I prepared a ${draft.kind.replace(/_/g, " ")} draft for “${target.title}”. It has NOT been sent — review and edit it, then create it as a Gmail draft when you're happy.\n\nSubject: ${draft.subject}\n\n${draft.body}`,
      items: [toItem(target)],
      usedAI: draft.generatedBy.startsWith("ai:") ? draft.generatedBy : null,
      action: { type: "draft_created", draftId: draft.id, opportunityId: target.id },
    };
  }

  switch (intent) {
    case "payments": {
      selected = open.filter((o) => o.category === "payment_followup");
      const fin = await db
        .select({ kind: extractedFinancialRecords.kind, amountCents: extractedFinancialRecords.amountCents, currency: extractedFinancialRecords.currency, subject: emailThreads.subject, createdAt: extractedFinancialRecords.createdAt })
        .from(extractedFinancialRecords)
        .innerJoin(emailThreads, eq(emailThreads.id, extractedFinancialRecords.threadId))
        .where(and(eq(extractedFinancialRecords.workspaceId, workspaceId), inArray(extractedFinancialRecords.kind, ["invoice", "payment_promise", "payment_confirmation"])))
        .orderBy(desc(extractedFinancialRecords.createdAt))
        .limit(20);
      answer = `Payment follow-ups needing attention:\n${list(selected, "None — no invoices currently look overdue.")}\n\nPayment-related conversations found:\n${fin.length ? fin.map((f) => `• “${f.subject}” — ${f.kind.replace(/_/g, " ")}${f.amountCents !== null ? ` (${formatMoney(f.amountCents, f.currency)})` : ""}`).join("\n") : "None."}\n\nNote: a missing payment email doesn't prove an invoice is unpaid — verify in your accounting system.`;
      break;
    }
    case "proposals":
      selected = open.filter((o) => o.category === "proposal_awaiting" || (o.category === "client_followup" && o.stage === "negotiating"));
      answer = `Proposals awaiting a response:\n${list(selected, "None right now.")}`;
      break;
    case "leads":
      selected = open.filter((o) => o.category === "unanswered_lead");
      answer = `Potential clients waiting for a reply:\n${list(selected, "No unanswered leads detected.")}`;
      break;
    case "followups":
      selected = open.filter((o) => o.category === "unanswered_lead" || o.category === "client_followup");
      answer = `Contacts who need a follow-up:\n${list(selected, "Nobody is currently waiting on you.")}`;
      break;
    case "priorities":
      selected = open.slice(0, 5);
      answer = `Suggested priorities for today (ranked by financial significance, time sensitivity, intent, activity and confidence):\n${list(selected, "Nothing open — you're all caught up.")}`;
      break;
    case "summary": {
      selected = open.slice(0, 8);
      const by = (c: string) => open.filter((o) => o.category === c).length;
      answer = `You have ${open.length} open opportunit${open.length === 1 ? "y" : "ies"}: ${by("unanswered_lead")} unanswered leads, ${by("proposal_awaiting")} proposals awaiting response, ${by("payment_followup")} payment follow-ups and ${by("client_followup")} client follow-ups.\n\nTop items:\n${list(selected, "—")}`;
      break;
    }
    default: {
      const m = matchOpportunity(question, open);
      selected = m ? [m] : open.slice(0, 5);
      answer = m ? `Here's what I found for that contact:\n${list(selected, "")}\n\n${m.summary}` : `I couldn't match that to a specific conversation. Here are your top open opportunities:\n${list(selected, "None.")}`;
    }
  }

  // Optional LLM phrasing — grounded strictly on the retrieved records; amounts verified.
  const data = selected.slice(0, 10).map((o) => ({ title: o.title, category: o.category, contact: o.contactName ?? o.contactEmail, amount: o.amountCents !== null ? formatMoney(o.amountCents, o.currency) : null, lastActivity: ago(o.lastInteractionAt), priority: o.priorityScore, summary: o.summary, nextAction: o.recommendedAction }));
  const ai = await runStructured({
    workspaceId,
    task: "assistant",
    agent: "assistant",
    promptVersion: ASSISTANT_PROMPT.version,
    schema: z.object({ answer: z.string().min(1).max(4000) }),
    request: { system: `${ASSISTANT_PROMPT.system}\nRespond ONLY with JSON: {"answer": string}`, user: `QUESTION: ${question.slice(0, 500)}\n\nDATA: ${JSON.stringify({ intent, openTotal: open.length, records: data })}`, maxTokens: 600 },
  });
  if (ai) {
    const allowed = new Set(extractAmounts(JSON.stringify(data)).map((a) => `${a.amountCents}:${a.currency}`));
    const bad = extractAmounts(ai.data.answer).some((a) => !allowed.has(`${a.amountCents}:${a.currency}`));
    if (!bad) return { answer: ai.data.answer, items: selected.slice(0, 8).map(toItem), usedAI: `${ai.provider}:${ai.model}` };
  }
  return { answer, items: selected.slice(0, 8).map(toItem), usedAI: null };
}
