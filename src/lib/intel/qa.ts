import type { NormalizedMessage, OpportunityCandidate, ThreadAnalysis } from "./types";

export type QaResult = { accepted: boolean; candidate: OpportunityCandidate; issues: string[] };

const MIN_CONFIDENCE = 0.45;

/**
 * Quality Assurance agent (deterministic). Verifies that every finding is grounded in the
 * source conversation and internally consistent. It can lower confidence, strip unsupported
 * fields, or reject a finding — it never adds information.
 */
export function validateCandidate(c: OpportunityCandidate, analysis: ThreadAnalysis, messages: NormalizedMessage[]): QaResult {
  const issues: string[] = [];
  const byId = new Map(messages.map((m) => [m.providerMessageId, m]));
  const out: OpportunityCandidate = { ...c, evidence: [...c.evidence], assumptions: [...c.assumptions] };

  // 1. Evidence must reference real messages in this thread, and excerpts must be verbatim.
  out.evidence = out.evidence.filter((e) => {
    const m = byId.get(e.providerMessageId);
    if (!m) {
      issues.push(`Evidence references unknown message ${e.providerMessageId}`);
      return false;
    }
    const core = e.excerpt.replace(/^…|…$/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (core && !m.bodyText.replace(/\s+/g, " ").includes(core)) {
      issues.push("Evidence excerpt not found verbatim in source message");
      return false;
    }
    return true;
  });
  if (out.evidence.length === 0) return { accepted: false, candidate: out, issues: [...issues, "No verifiable evidence"] };

  // 2. Amounts must appear verbatim in one of the evidence messages (or a thread message).
  if (out.amountCents !== null) {
    const fin = analysis.financials.find((f) => f.amountCents === out.amountCents && f.currency === out.currency);
    const src = fin ? byId.get(fin.providerMessageId) : undefined;
    if (!fin || !src || !src.bodyText.includes(fin.rawText)) {
      issues.push("Amount could not be traced to source text; removed");
      out.amountCents = null;
      out.currency = null;
      out.amountMethod = null;
    }
  }

  // 3. Category-specific consistency checks.
  const outbound = (id: string) => analysis.messages.find((m) => m.providerMessageId === id)?.direction === "outbound";
  if (out.category === "payment_followup") {
    const inv = out.evidence.find((e) => e.kind === "invoice_sent");
    if (!inv || !outbound(inv.providerMessageId)) return { accepted: false, candidate: out, issues: [...issues, "Invoice was not sent by the business"] };
    const invDate = byId.get(inv.providerMessageId)!.date.getTime();
    const paidLater = analysis.messages.some((m) => m.signals.some((s) => s.type === "payment_confirmation") && byId.get(m.providerMessageId)!.date.getTime() > invDate);
    if (paidLater) return { accepted: false, candidate: out, issues: [...issues, "Payment confirmation exists after invoice"] };
    if (out.dueDate && Math.abs(out.dueDate.getTime() - invDate) > 400 * 86_400_000) {
      issues.push("Due date implausibly far from invoice date; removed");
      out.dueDate = null;
      out.confidence -= 0.1;
    }
  }
  if (out.category === "unanswered_lead") {
    const ev = byId.get(out.evidence[0].providerMessageId)!;
    const replied = messages.some((m) => m.date > ev.date && analysis.messages.find((a) => a.providerMessageId === m.providerMessageId)?.direction === "outbound");
    if (replied) return { accepted: false, candidate: out, issues: [...issues, "Lead has already been answered"] };
  }
  if (out.category === "proposal_awaiting" && (analysis.stage === "won" || analysis.stage === "lost")) {
    return { accepted: false, candidate: out, issues: [...issues, `Proposal already concluded (${analysis.stage})`] };
  }

  // 4. Untrusted-content safety.
  if (analysis.injectionSuspected) {
    issues.push("Conversation contains instruction-like text; treated as data only");
    out.confidence -= 0.1;
  }

  out.confidence = Math.round(Math.max(0, Math.min(1, out.confidence)) * 100) / 100;
  if (out.confidence < MIN_CONFIDENCE) return { accepted: false, candidate: out, issues: [...issues, "Confidence below threshold"] };
  return { accepted: true, candidate: out, issues };
}
