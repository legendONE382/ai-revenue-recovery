import type { OpportunityCategory } from "./types";

const DAY = 86_400_000;

/** Rough FX to USD purely for *ranking* (never displayed as a converted figure). */
const RANK_FX: Record<string, number> = { USD: 1, GBP: 1.27, EUR: 1.08, AUD: 0.66, CAD: 0.73, NZD: 0.6, CHF: 1.12, SGD: 0.74, INR: 0.012, JPY: 0.0067 };

export type PriorityInput = {
  category: OpportunityCategory;
  amountCents: number | null;
  currency: string | null;
  confidence: number;
  lastInteractionAt: Date;
  dueDate: Date | null;
  messageCount: number;
  now: Date;
};

export const WEIGHTS = { financial: 30, time: 25, intent: 20, activity: 10, confidence: 15 } as const;

const INTENT: Record<OpportunityCategory, number> = {
  payment_followup: 0.95, // money already earned
  proposal_awaiting: 0.8,
  unanswered_lead: 0.75,
  client_followup: 0.6,
};

/**
 * Deterministic priority score (0-100). Each factor is normalised to 0..1 and weighted.
 * Returned factors are stored and shown to users so the ranking is explainable.
 */
export function scoreOpportunity(i: PriorityInput): { score: number; factors: Record<string, number> } {
  const usd = i.amountCents !== null ? (i.amountCents / 100) * (RANK_FX[i.currency ?? "USD"] ?? 1) : null;
  // log scale: $100 ≈ 0.4, $1k ≈ 0.6, $10k ≈ 0.8, $100k ≈ 1
  const financial = usd === null ? 0.3 : Math.max(0, Math.min(1, Math.log10(usd + 1) / 5));

  const ageDays = Math.max(0, (i.now.getTime() - i.lastInteractionAt.getTime()) / DAY);
  let time: number;
  switch (i.category) {
    case "unanswered_lead":
      // Leads cool fast: urgency climbs over 2 days, then decays after 3 weeks as the lead likely went elsewhere.
      time = Math.min(1, 0.4 + ageDays / 3.3);
      if (ageDays > 21) time *= Math.max(0.35, 1 - (ageDays - 21) / 60);
      break;
    case "proposal_awaiting":
      time = Math.min(1, 0.3 + ageDays / 14);
      if (ageDays > 45) time *= Math.max(0.4, 1 - (ageDays - 45) / 90);
      break;
    case "payment_followup": {
      const overdue = i.dueDate ? Math.max(0, (i.now.getTime() - i.dueDate.getTime()) / DAY) : ageDays;
      time = Math.min(1, 0.5 + overdue / 45);
      break;
    }
    default:
      time = Math.min(1, 0.35 + ageDays / 7);
      if (ageDays > 30) time *= 0.6;
  }

  const intent = INTENT[i.category];
  const activity = Math.min(1, 0.25 + i.messageCount / 8);
  const confidence = Math.max(0, Math.min(1, i.confidence));

  const factors = { financial, time, intent, activity, confidence };
  const score = Math.round(
    financial * WEIGHTS.financial + time * WEIGHTS.time + intent * WEIGHTS.intent + activity * WEIGHTS.activity + confidence * WEIGHTS.confidence,
  );
  return { score: Math.max(0, Math.min(100, score)), factors: Object.fromEntries(Object.entries(factors).map(([k, v]) => [k, Math.round(v * 100) / 100])) };
}

export function priorityLabel(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 75) return "critical";
  if (score >= 60) return "high";
  if (score >= 45) return "medium";
  return "low";
}
