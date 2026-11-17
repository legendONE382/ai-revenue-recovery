import { excerptAround, extractAmounts, extractDates, extractInvoiceRef, extractQuestions, formatMoney, pickPrimaryAmount } from "./extract";
import { prefilter } from "./filter";
import { COMMERCIAL_SIGNALS, LEAD_SIGNALS, detectSignals, has, strongest } from "./signals";
import {
  DEFAULT_SETTINGS,
  type ConversationStatus,
  type DetectionSettings,
  type Evidence,
  type FinancialKind,
  type FinancialRecord,
  type MessageAnalysis,
  type NormalizedMessage,
  type OpportunityCandidate,
  type Signal,
  type Stage,
  type ThreadAnalysis,
  type ThreadClassification,
} from "./types";

const DAY = 86_400_000;
const HOUR = 3_600_000;

/* ───────────────────────── State machine ───────────────────────── */

const TERMINAL: Stage[] = ["won", "lost", "paid"];

/**
 * Pure conversation-stage transition function. One message at a time, in chronological order.
 * Lifecycle: new → contacted → proposal_sent → negotiating → won/lost; won/any → invoiced → paid.
 */
export function transition(stage: Stage, direction: "inbound" | "outbound", signals: Signal[]): Stage {
  const t = (x: Signal["type"]) => has(signals, x);
  if (t("payment_confirmation")) return "paid";
  if (direction === "outbound" && t("invoice_sent")) return "invoiced";
  if (direction === "inbound" && t("rejection") && stage !== "invoiced" && stage !== "paid") return "lost";
  if (direction === "inbound" && t("acceptance") && !["invoiced", "paid"].includes(stage)) return "won";
  if (direction === "outbound" && t("proposal_sent") && !["invoiced", "paid", "won"].includes(stage)) return "proposal_sent";
  if (stage === "proposal_sent" && direction === "inbound" && !t("thanks_only")) return "negotiating";
  if (stage === "new" && direction === "outbound") return "contacted";
  if (stage === "lost" && direction === "inbound" && LEAD_SIGNALS.some((s) => t(s))) return "new"; // a lost prospect came back
  if (stage === "dormant") return direction === "outbound" ? "contacted" : "new";
  return stage;
}

/* ───────────────────────── Helpers ───────────────────────── */

function qualifiesAsLead(signals: Signal[]): boolean {
  const lead = strongest(signals, ...LEAD_SIGNALS);
  if (!lead) return false;
  // Pricing questions alone ("how much was the ticket?") need business context to avoid personal false positives.
  if (lead.type === "pricing_question" && !has(signals, "business_context")) return false;
  if (lead.weight < 0.65 && !has(signals, "business_context")) return false;
  return true;
}

function evidenceFor(msg: NormalizedMessage, kind: string, match: string | undefined, detail?: Record<string, unknown>): Evidence {
  const idx = match ? msg.bodyText.toLowerCase().indexOf(match.toLowerCase()) : -1;
  return {
    providerMessageId: msg.providerMessageId,
    kind,
    excerpt: idx >= 0 ? excerptAround(msg.bodyText, idx) : excerptAround(msg.bodyText, 0, 160),
    detail,
  };
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function displayName(c: { email: string; name: string | null } | null): string {
  return c?.name || c?.email || "Unknown contact";
}

function financialKindFor(direction: "inbound" | "outbound", signals: Signal[]): FinancialKind {
  if (has(signals, "payment_confirmation")) return "payment_confirmation";
  if (direction === "outbound" && has(signals, "invoice_sent")) return "invoice";
  if (direction === "outbound" && has(signals, "proposal_sent")) return /quot/i.test(strongest(signals, "proposal_sent")?.match ?? "") ? "quote" : "proposal";
  if (direction === "inbound" && has(signals, "payment_promise")) return "payment_promise";
  return "price_mention";
}

/* ───────────────────────── Main analysis ───────────────────────── */

export type AnalyseOptions = {
  ownerEmails: Set<string>;
  now: Date;
  settings?: Partial<DetectionSettings>;
  suppressedContacts?: Set<string>;
};

export function analyseThread(input: NormalizedMessage[], opts: AnalyseOptions): ThreadAnalysis {
  const settings = { ...DEFAULT_SETTINGS, ...opts.settings };
  const now = opts.now;
  const owner = opts.ownerEmails;
  const msgs = [...input].sort((a, b) => a.date.getTime() - b.date.getTime());
  const notes: string[] = [];

  const analyses: MessageAnalysis[] = msgs.map((m) => {
    const direction = owner.has(m.from.email.toLowerCase()) ? "outbound" : "inbound";
    const filter = prefilter(m, owner);
    const relevant = filter === "candidate";
    return {
      providerMessageId: m.providerMessageId,
      direction,
      filter,
      signals: relevant ? detectSignals(`${m.subject}\n${m.bodyText}`, direction) : [],
      amounts: relevant ? extractAmounts(m.bodyText) : [],
      dates: relevant ? extractDates(m.bodyText, m.date) : [],
      questions: relevant && direction === "inbound" ? extractQuestions(m.bodyText) : [],
      invoiceRef: relevant ? extractInvoiceRef(`${m.subject}\n${m.bodyText}`) : null,
    };
  });

  const pairs = msgs.map((m, i) => ({ m, a: analyses[i] }));
  const relevant = pairs.filter((p) => p.a.filter === "candidate");
  const lastMessageAt = msgs.length ? msgs[msgs.length - 1].date : null;
  const injectionSuspected = analyses.some((a) => has(a.signals, "injection_suspected"));
  if (injectionSuspected) notes.push("Contains instruction-like text aimed at automated systems; treated strictly as data.");

  // Contact identity: first external participant
  const firstInbound = relevant.find((p) => p.a.direction === "inbound");
  let contact: ThreadAnalysis["contact"] = firstInbound ? { email: firstInbound.m.from.email.toLowerCase(), name: firstInbound.m.from.name } : null;
  if (!contact) {
    const firstOut = relevant.find((p) => p.a.direction === "outbound");
    const ext = firstOut?.m.to.find((e) => !owner.has(e.toLowerCase()));
    if (ext) contact = { email: ext.toLowerCase(), name: null };
  }

  // Classification
  let classification: ThreadClassification;
  if (relevant.length === 0) {
    const counts = new Map<string, number>();
    analyses.forEach((a) => counts.set(a.filter, (counts.get(a.filter) ?? 0) + 1));
    classification = ([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other") as ThreadClassification;
  } else {
    const commercial = relevant.some(({ a }) => {
      const sig = a.signals.filter((s) => COMMERCIAL_SIGNALS.includes(s.type));
      if (sig.length === 0) return false;
      if (sig.every((s) => LEAD_SIGNALS.includes(s.type))) return qualifiesAsLead(a.signals);
      return true;
    });
    classification = commercial ? "commercial" : "other";
  }

  // Stage
  let stage: Stage = "new";
  for (const { a } of relevant) stage = transition(stage, a.direction, a.signals);
  if (lastMessageAt && now.getTime() - lastMessageAt.getTime() > settings.dormantDays * DAY && !TERMINAL.includes(stage) && stage !== "invoiced") {
    stage = "dormant";
  }

  // Conversation status
  const last = relevant[relevant.length - 1];
  let status: ConversationStatus = "no_action";
  if (last) {
    if (stage === "lost" || has(last.a.signals, "closing")) status = "closed";
    else if (last.a.direction === "inbound") status = has(last.a.signals, "thanks_only") ? "no_action" : "awaiting_business";
    else status = "awaiting_contact";
  }

  // Financial records
  const financials: FinancialRecord[] = [];
  for (const { m, a } of relevant) {
    const kind = financialKindFor(a.direction, a.signals);
    const futureDates = a.dates.filter((d) => d.date.getTime() >= m.date.getTime() - DAY && d.confidence >= 0.55);
    const dueDate = kind === "invoice" || kind === "payment_promise" ? futureDates.sort((x, y) => x.date.getTime() - y.date.getTime())[0]?.date ?? null : null;
    if (a.amounts.length === 0) {
      if (kind === "invoice" || kind === "payment_promise" || kind === "payment_confirmation") {
        financials.push({ kind, providerMessageId: m.providerMessageId, amountCents: null, currency: null, rawText: strongest(a.signals, "invoice_sent", "payment_promise", "payment_confirmation")?.match ?? kind, dueDate, reference: a.invoiceRef, confidence: 0.6 });
      }
      continue;
    }
    const primary = pickPrimaryAmount(a.amounts);
    for (const amt of a.amounts) {
      const isPrimary = primary?.amount === amt;
      financials.push({
        kind: isPrimary ? kind : "price_mention",
        providerMessageId: m.providerMessageId,
        amountCents: amt.amountCents,
        currency: amt.currency,
        rawText: amt.raw,
        dueDate: isPrimary ? dueDate : null,
        reference: a.invoiceRef,
        confidence: isPrimary ? (amt.isTotal || a.amounts.length === 1 ? 0.9 : 0.65) : 0.5,
      });
    }
  }

  const candidates: OpportunityCandidate[] = [];
  const suppressed = contact && opts.suppressedContacts?.has(contact.email);
  if (suppressed) notes.push("Contact suppressed by user feedback; no opportunities raised.");

  if (classification === "commercial" && contact && !suppressed) {
    const name = displayName(contact);
    const subject = msgs[0]?.subject || "(no subject)";
    const lastRel = last!;
    const idxOf = (p: (typeof relevant)[number]) => relevant.indexOf(p);
    const outboundAfter = (i: number) => relevant.slice(i + 1).some((p) => p.a.direction === "outbound");
    const inboundAfter = (i: number) => relevant.slice(i + 1).filter((p) => p.a.direction === "inbound");

    /* A. Unanswered lead / unanswered client request */
    const leadMsgs = relevant.filter((p) => p.a.direction === "inbound" && qualifiesAsLead(p.a.signals));
    const latestLead = leadMsgs[leadMsgs.length - 1];
    let clientFollowup: OpportunityCandidate | null = null;
    if (latestLead && !["lost", "won", "invoiced", "paid"].includes(stage)) {
      const i = idxOf(latestLead);
      const waitingHours = (now.getTime() - latestLead.m.date.getTime()) / HOUR;
      const priorOutbound = relevant.slice(0, i).some((p) => p.a.direction === "outbound");
      if (!outboundAfter(i) && waitingHours >= settings.leadResponseHours && !has(lastRel.a.signals, "closing")) {
        const sig = strongest(latestLead.a.signals, ...LEAD_SIGNALS)!;
        const conf = Math.min(0.95, 0.45 + sig.weight * 0.4 + (has(latestLead.a.signals, "business_context") ? 0.08 : 0) + (latestLead.a.questions.length ? 0.04 : 0));
        const budget = pickPrimaryAmount(latestLead.a.amounts);
        const cand: OpportunityCandidate = {
          category: priorOutbound ? "client_followup" : "unanswered_lead",
          reason: priorOutbound ? "unanswered_request" : sig.type,
          title: priorOutbound ? `${name} is waiting for your reply` : `New enquiry from ${name} has no reply`,
          summary: `${name} wrote on ${fmtDate(latestLead.m.date)} (“${subject}”) — ${sig.type.replace(/_/g, " ")} detected: “${sig.match}”. No reply from your mailbox has been sent since.`,
          stage: stage === "dormant" ? "dormant" : priorOutbound ? stage : "new",
          amountCents: budget?.amount.amountCents ?? null,
          currency: budget?.amount.currency ?? null,
          amountMethod: budget ? `Budget stated by prospect — ${budget.method}` : null,
          confidence: conf,
          lastInteractionAt: lastRel.m.date,
          dueDate: null,
          recommendedAction:
            sig.type === "pricing_question" || sig.type === "quote_request"
              ? "Reply with pricing (or a range) and suggest a short call to confirm scope."
              : sig.type === "consultation_request"
                ? "Reply with two or three time slots for the call they requested."
                : "Reply to the enquiry, answer their questions and propose a clear next step.",
          evidence: [evidenceFor(latestLead.m, sig.type, sig.match, { signals: latestLead.a.signals.map((s) => s.type) })],
          assumptions: budget ? ["Amount is the prospect's stated budget, not an agreed price."] : [],
        };
        if (priorOutbound) clientFollowup = cand;
        else candidates.push(cand);
      }
    }

    /* B. Proposal awaiting response */
    const proposals = relevant.filter((p) => p.a.direction === "outbound" && has(p.a.signals, "proposal_sent"));
    const latestProposal = proposals[proposals.length - 1];
    if (latestProposal && (stage === "proposal_sent" || stage === "negotiating" || stage === "dormant")) {
      const i = idxOf(latestProposal);
      const priced = pickPrimaryAmount(latestProposal.a.amounts);
      const inactiveDays = (now.getTime() - lastRel.m.date.getTime()) / DAY;
      const replies = inboundAfter(i).filter((p) => !has(p.a.signals, "thanks_only"));
      if (lastRel.a.direction === "outbound" && inactiveDays >= settings.proposalInactivityDays) {
        const sig = strongest(latestProposal.a.signals, "proposal_sent")!;
        candidates.push({
          category: "proposal_awaiting",
          reason: replies.length ? "negotiation_stalled" : "no_response",
          title: `${replies.length ? "Negotiation" : "Proposal"} with ${name} has gone quiet`,
          summary: `You sent ${priced ? `a proposal for ${formatMoney(priced.amount.amountCents, priced.amount.currency)}` : "a proposal"} on ${fmtDate(latestProposal.m.date)}. ${
            replies.length ? `${name} replied, then the conversation stopped after your last message` : `${name} has not replied`
          } (${Math.floor(inactiveDays)} days without activity).`,
          stage: stage === "dormant" ? "dormant" : replies.length ? "negotiating" : "proposal_sent",
          amountCents: priced?.amount.amountCents ?? null,
          currency: priced?.amount.currency ?? null,
          amountMethod: priced ? priced.method : null,
          confidence: Math.min(0.95, 0.5 + sig.weight * 0.45),
          lastInteractionAt: lastRel.m.date,
          dueDate: null,
          recommendedAction: "Send a brief, friendly check-in: ask whether they have questions and offer to adjust scope or timing.",
          evidence: [evidenceFor(latestProposal.m, "proposal_sent", sig.match, priced ? { amount: priced.amount.raw } : undefined)],
          assumptions: priced ? [] : ["No price could be read from the proposal email (it may be in an attachment)."],
        });
      } else if (lastRel.a.direction === "inbound" && replies.length && !clientFollowup && !has(lastRel.a.signals, "thanks_only", "closing")) {
        const hours = (now.getTime() - lastRel.m.date.getTime()) / HOUR;
        if (hours >= settings.leadResponseHours) {
          clientFollowup = {
            category: "client_followup",
            reason: "proposal_reply_unanswered",
            title: `${name} replied to your proposal — awaiting you`,
            summary: `${name} responded to your proposal on ${fmtDate(lastRel.m.date)} and has not had a reply.`,
            stage: "negotiating",
            amountCents: priced?.amount.amountCents ?? null,
            currency: priced?.amount.currency ?? null,
            amountMethod: priced?.method ?? null,
            confidence: 0.8,
            lastInteractionAt: lastRel.m.date,
            dueDate: null,
            recommendedAction: "Answer their questions on the proposal promptly; this deal is actively being considered.",
            evidence: [evidenceFor(lastRel.m, "prospect_reply", strongest(lastRel.a.signals, "question", "info_request", "pricing_question")?.match), evidenceFor(latestProposal.m, "proposal_sent", strongest(latestProposal.a.signals, "proposal_sent")?.match)],
            assumptions: [],
          };
        }
      }
    }

    /* C. Payment follow-up */
    const invoices = relevant.filter((p) => p.a.direction === "outbound" && has(p.a.signals, "invoice_sent"));
    const latestInvoice = invoices[invoices.length - 1];
    if (latestInvoice && stage !== "paid") {
      const i = idxOf(latestInvoice);
      const after = relevant.slice(i + 1);
      const confirmed = after.some((p) => has(p.a.signals, "payment_confirmation"));
      if (!confirmed) {
        const invFin = financials.find((f) => f.providerMessageId === latestInvoice.m.providerMessageId && f.kind === "invoice");
        const promise = [...after].reverse().find((p) => p.a.direction === "inbound" && has(p.a.signals, "payment_promise"));
        const promiseFin = promise ? financials.find((f) => f.providerMessageId === promise.m.providerMessageId && f.kind === "payment_promise") : undefined;
        const assumptions: string[] = [];
        let due: Date;
        let dueBasis: string;
        if (promiseFin?.dueDate) {
          due = promiseFin.dueDate;
          dueBasis = "payment date promised by the client";
        } else if (invFin?.dueDate) {
          due = invFin.dueDate;
          dueBasis = "due date stated in the invoice email";
        } else {
          due = new Date(latestInvoice.m.date.getTime() + settings.assumedPaymentTermsDays * DAY);
          dueBasis = `assumed ${settings.assumedPaymentTermsDays}-day payment terms (no due date found)`;
          assumptions.push(`No due date found; assumed ${settings.assumedPaymentTermsDays}-day terms (configurable).`);
        }
        const overdueDays = (now.getTime() - due.getTime()) / DAY;
        if (overdueDays >= settings.paymentGraceDays) {
          assumptions.push("No payment confirmation was found in this conversation. Payment may have been made without an email — verify in your accounting system before chasing.");
          const amountCents = invFin?.amountCents ?? null;
          const sig = strongest(latestInvoice.a.signals, "invoice_sent")!;
          const ev = [evidenceFor(latestInvoice.m, "invoice_sent", sig.match, { reference: latestInvoice.a.invoiceRef, amount: invFin?.rawText })];
          if (promise) ev.push(evidenceFor(promise.m, "payment_promise", strongest(promise.a.signals, "payment_promise")?.match));
          candidates.push({
            category: "payment_followup",
            reason: promise ? "promise_missed" : "potentially_overdue",
            title: `${amountCents !== null ? formatMoney(amountCents, invFin!.currency) + " " : ""}invoice${latestInvoice.a.invoiceRef ? ` ${latestInvoice.a.invoiceRef}` : ""} to ${name} may be overdue`,
            summary: `Invoice sent on ${fmtDate(latestInvoice.m.date)}. Due ${fmtDate(due)} (${dueBasis}). ${promise ? `${name} said they would pay (“${strongest(promise.a.signals, "payment_promise")?.match}”), ` : ""}no payment confirmation found ${Math.floor(overdueDays)} days after the due date.`,
            stage: "invoiced",
            amountCents,
            currency: invFin?.currency ?? null,
            amountMethod: amountCents !== null ? "Amount stated in the invoice email" : null,
            confidence: Math.min(0.92, 0.55 + sig.weight * 0.35 - (assumptions.length > 1 ? 0.1 : 0)),
            lastInteractionAt: lastRel.m.date,
            dueDate: due,
            recommendedAction: `Send a courteous payment reminder${latestInvoice.a.invoiceRef ? ` referencing invoice ${latestInvoice.a.invoiceRef}` : ""} and ask whether anything is needed to process it.`,
            evidence: ev,
            assumptions,
          });
        }
      }
    }

    /* D. Forgotten client follow-ups */
    if (!clientFollowup && stage !== "lost") {
      const lastIdx = relevant.length - 1;
      const lastOutIdx = relevant.map((p) => p.a.direction).lastIndexOf("outbound");
      const hoursSinceLast = (now.getTime() - lastRel.m.date.getTime()) / HOUR;
      // D1. Client asked something and is waiting
      if (
        lastRel.a.direction === "inbound" &&
        lastOutIdx >= 0 &&
        !has(lastRel.a.signals, "thanks_only", "closing", "payment_confirmation") &&
        has(lastRel.a.signals, "question", "info_request", "renewal") &&
        hoursSinceLast >= settings.followUpDays * 24
      ) {
        const sig = strongest(lastRel.a.signals, "renewal", "info_request", "question")!;
        clientFollowup = {
          category: "client_followup",
          reason: sig.type === "renewal" ? "renewal" : "outstanding_question",
          title: sig.type === "renewal" ? `Renewal conversation with ${name} needs a reply` : `${name} is waiting on an answer`,
          summary: `${name} wrote on ${fmtDate(lastRel.m.date)}: “${sig.match}”. No reply has been sent (${Math.floor(hoursSinceLast / 24)} days).`,
          stage,
          amountCents: null,
          currency: null,
          amountMethod: null,
          confidence: sig.type === "question" ? 0.7 : 0.8,
          lastInteractionAt: lastRel.m.date,
          dueDate: null,
          recommendedAction: sig.type === "renewal" ? "Reply to discuss the renewal before the current term ends." : "Answer the outstanding question or send what was requested.",
          evidence: [evidenceFor(lastRel.m, sig.type, sig.match)],
          assumptions: [],
        };
      }
      // D2. You promised to get back and haven't
      if (!clientFollowup && lastOutIdx >= 0) {
        const lo = relevant[lastOutIdx];
        const trailing = relevant.slice(lastOutIdx + 1);
        const onlyAcks = trailing.every((p) => has(p.a.signals, "thanks_only"));
        const daysSince = (now.getTime() - lo.m.date.getTime()) / DAY;
        if (has(lo.a.signals, "callback_promise") && onlyAcks && daysSince >= settings.callbackDays && lastIdx >= 0) {
          const sig = strongest(lo.a.signals, "callback_promise")!;
          clientFollowup = {
            category: "client_followup",
            reason: "promised_callback",
            title: `You promised to get back to ${name}`,
            summary: `On ${fmtDate(lo.m.date)} you wrote “${sig.match}”. Nothing further has been sent in ${Math.floor(daysSince)} days.`,
            stage,
            amountCents: null,
            currency: null,
            amountMethod: null,
            confidence: 0.75,
            lastInteractionAt: lastRel.m.date,
            dueDate: null,
            recommendedAction: "Follow through on what you promised, or send a quick update with a new timeline.",
            evidence: [evidenceFor(lo.m, "callback_promise", sig.match)],
            assumptions: ["You may have followed up by phone or another channel."],
          };
        }
      }
    }
    if (clientFollowup) candidates.push(clientFollowup);
  }

  const ambiguous =
    classification === "other" &&
    relevant.some((p) => p.a.direction === "inbound" && (p.a.questions.length > 0 || has(p.a.signals, "business_context")) && !has(p.a.signals, "thanks_only"));

  return { classification, status, stage, contact, messages: analyses, financials, candidates, ambiguous, injectionSuspected, lastMessageAt, notes };
}
