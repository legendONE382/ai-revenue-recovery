import type { Signal, SignalType } from "./types";

type Rule = { type: SignalType; re: RegExp; weight: number; dir: "inbound" | "outbound" | "any" };

/**
 * Deterministic commercial-signal rules. Direction matters: "attached is our proposal" means
 * something only when the business sends it; "we'll pay on Friday" only when the client does.
 * Weights are calibrated against the fixture dataset (see tests/evaluation.test.ts).
 */
const RULES: Rule[] = [
  // Lead / enquiry signals (from prospects)
  { type: "enquiry", dir: "inbound", weight: 0.8, re: /\b(i'?m|we'?re|we are|i am)\s+(interested in|looking for|looking to hire|hoping to find|in the market for)\b/i },
  { type: "enquiry", dir: "inbound", weight: 0.75, re: /\b(would|we'?d|i'?d)\s+(like|love)\s+to\s+(discuss|hire|work with you|talk about|get (a|your) (quote|proposal|estimate)|know more about your|engage)\b/i },
  { type: "enquiry", dir: "inbound", weight: 0.75, re: /\bdo you (offer|provide|do|take on|handle|work on)\b/i },
  { type: "enquiry", dir: "inbound", weight: 0.65, re: /\b(are you|would you be) (available|open|taking on (new )?(clients|projects|work))\b/i },
  { type: "enquiry", dir: "inbound", weight: 0.7, re: /\b(came across|found|saw) your (website|portfolio|profile|work|agency|services|listing)\b/i },
  { type: "enquiry", dir: "inbound", weight: 0.6, re: /\b(was )?referred (to you )?by\b|\brecommended you\b/i },
  { type: "enquiry", dir: "inbound", weight: 0.6, re: /\bwe need (a|an|someone|help with)\b|\bneed help with (our|a|my)\b/i },
  { type: "pricing_question", dir: "inbound", weight: 0.7, re: /\bhow much (would|does|do|will|is)\b|\bwhat (do|would) you charge\b/i },
  { type: "pricing_question", dir: "inbound", weight: 0.7, re: /\b(your|the) (rates|pricing|prices|fees|day rate|hourly rate)\b|\brate card\b/i },
  { type: "pricing_question", dir: "inbound", weight: 0.55, re: /\b(our|the|a) budget (is|of|around|for)\b|\bballpark\b/i },
  { type: "quote_request", dir: "inbound", weight: 0.85, re: /\b(send|provide|give|share|put together)\s+(me|us)?\s*(a|an|your)\s+(quote|quotation|estimate|proposal|price)\b/i },
  { type: "quote_request", dir: "inbound", weight: 0.85, re: /\b(request(ing)?|need|want) (a|an) (quote|quotation|estimate)\b|\bcan you quote\b/i },
  { type: "consultation_request", dir: "inbound", weight: 0.7, re: /\b(book|schedule|arrange|set up|hop on|jump on|have) (a|an) (quick )?(call|meeting|consultation|chat|intro call|discovery call)\b/i },
  { type: "info_request", dir: "inbound", weight: 0.6, re: /\b(send|share)\s+(me|us|over)\s+(some\s+)?(more\s+)?(info|information|details|examples|portfolio|case studies|the revised|the updated|a revised|an updated)\b/i },
  { type: "info_request", dir: "inbound", weight: 0.5, re: /\bcould you (send|share|clarify|confirm|let (me|us) know)\b/i },

  // Business-side commercial actions
  { type: "proposal_sent", dir: "outbound", weight: 0.85, re: /\b(attached|enclosed)\b[^.\n]{0,40}\b(proposal|quote|quotation|estimate|statement of work|sow)\b/i },
  { type: "proposal_sent", dir: "outbound", weight: 0.85, re: /\b(please find|here'?s|here is|i'?ve attached|sharing)\b[^.\n]{0,30}\b(proposal|quote|quotation|estimate)\b/i },
  { type: "proposal_sent", dir: "outbound", weight: 0.75, re: /\b(my|our) (fee|price|quote|estimate)\b[^.\n?]{0,25}\b(would be|will be|is|comes to)\b|\b(i|we) (can|could) do (it|this|the project) for\b|\btotal (cost|price|investment|fee) (would be|is|comes to|of)\b/i },
  { type: "invoice_sent", dir: "outbound", weight: 0.9, re: /\b(attached|enclosed|please find|here'?s|here is|i'?ve attached|sending)\b[^.\n]{0,40}\binvoice\b/i },
  { type: "invoice_sent", dir: "outbound", weight: 0.8, re: /\binvoice\s*(#|no\.?|number)\s*\w+/i },
  { type: "payment_request", dir: "outbound", weight: 0.7, re: /\b(payment|balance|invoice|amount)\s+(is\s+)?(due|outstanding|overdue)\b|\bpayment terms\b|\bnet\s?-?\d{1,3}\b/i },
  { type: "payment_request", dir: "outbound", weight: 0.7, re: /\b(kindly|please)\s+(arrange|make|send|process)\s+(the\s+)?payment\b|\boutstanding (balance|invoice|amount)\b/i },

  // Client-side payment behaviour
  { type: "payment_promise", dir: "inbound", weight: 0.8, re: /\b(will|'ll|going to|plan to|aim to)\s+(pay|transfer|settle|send (the |over )?payment|process (the |your )?(payment|invoice))\b/i },
  { type: "payment_promise", dir: "inbound", weight: 0.7, re: /\bpayment (will|should) (be|go|arrive|clear)\b|\b(passed|forwarded|sent) (it|this|the invoice|your invoice) (on )?to (our )?(accounts|finance|ap|accounts payable)\b|\bin (our|the) (next )?payment run\b/i },
  { type: "payment_confirmation", dir: "inbound", weight: 0.9, re: /\b(have|has|just|i'?ve|we'?ve)\s+(now\s+)?(paid|settled|transferred|sent (the |over )?payment|made (the )?payment|wired)\b/i },
  { type: "payment_confirmation", dir: "inbound", weight: 0.85, re: /\bpayment (has been|was|is) (sent|made|processed|completed|done|transferred)\b|\bpaid (in full|today|yesterday|this morning)\b|\btransfer (is |has )?(done|complete|gone through)\b/i },
  { type: "payment_confirmation", dir: "outbound", weight: 0.9, re: /\b(received|got)\s+(your|the)\s+payment\b|\bthanks? (you )?for (the|your) (prompt )?payment\b|\bpayment received\b/i },

  // Outcomes
  { type: "acceptance", dir: "inbound", weight: 0.85, re: /\b(let'?s|happy to|we'?d like to|we want to|keen to|ready to)\s+(go ahead|proceed|move forward|get started|kick off)\b/i },
  { type: "acceptance", dir: "inbound", weight: 0.85, re: /\b(accept(ed)?|approve(d)?|signed)\b[^.\n]{0,20}\b(proposal|quote|contract|estimate|sow)\b|\byou'?re hired\b/i },
  { type: "rejection", dir: "inbound", weight: 0.9, re: /\b(decided|chosen|chose|going|opted) (to go )?with (another|someone else|a different|an?other)\b/i },
  { type: "rejection", dir: "inbound", weight: 0.85, re: /\b(not|won'?t be) (moving|going) (forward|ahead)\b|\bno longer (need|interested|require|pursuing)\b|\bpass on this\b|\bnot the right (fit|time)\b/i },
  { type: "rejection", dir: "inbound", weight: 0.7, re: /\b(put|putting) (this|it|the project|things) on hold\b|\b(outside|over|beyond|isn'?t in|not in|not within) (our|the) budget\b/i },
  { type: "closing", dir: "any", weight: 0.7, re: /\b(no (further )?action (needed|required)|no need to (reply|respond)|all (set|sorted)|that'?s all (i|we) needed|closing (this|the) (thread|ticket|loop))\b/i },

  // Follow-up obligations
  { type: "callback_promise", dir: "outbound", weight: 0.75, re: /\b(i'?ll|i will|we'?ll|we will|let me)\s+(get back to you|follow up|circle back|come back to you|send (it|this|that|you|over)|call you|check and (get back|confirm))\b/i },
  { type: "renewal", dir: "any", weight: 0.7, re: /\b(renew(al|ing)?|(contract|retainer|subscription|agreement|licen[cs]e) (ends|expires|is up|runs out|ending))\b/i },

  // Context
  { type: "business_context", dir: "any", weight: 0.3, re: /\b(website|project|design|development|consult(ing|ation)?|service|services|campaign|branding|audit|strategy|retainer|scope|deliverables?|contract|agency|business|company|clients?|marketing|seo|app|software|copywriting|photography|bookkeeping|training|workshop)\b/i },
  { type: "thanks_only", dir: "any", weight: 0.6, re: /^\s*(hi\s+\w+[,!]?\s*)?(thanks|thank you|thx|cheers|great|perfect|got it|received|awesome|brilliant)([,!.\s]+(so much|a lot|again|got it|received|for (this|that|sending|the update)|looks (good|great))?)*[!.\s]*(-+\s*\w+|best,?\s*\w+|cheers,?\s*\w+|thanks,?\s*\w+)?\s*$/i },

  // Untrusted-content safety marker: instruction-like text aimed at automated systems
  { type: "injection_suspected", dir: "any", weight: 1, re: /\b(ignore (all |any )?(previous|prior|above) (instructions|prompts)|system prompt|you are (now )?an? (ai|assistant|language model)|reveal (your|the) (api key|secret|password|instructions)|mark (all|every) (invoices?|opportunit(y|ies)) as)\b/i },
];

export function detectSignals(text: string, direction: "inbound" | "outbound"): Signal[] {
  const signals: Signal[] = [];
  const seen = new Set<string>();
  for (const r of RULES) {
    if (r.dir !== "any" && r.dir !== direction) continue;
    const m = text.match(r.re);
    if (!m) continue;
    const key = `${r.type}`;
    if (seen.has(key)) {
      // keep strongest match per type
      const existing = signals.find((s) => s.type === r.type)!;
      if (r.weight > existing.weight) {
        existing.weight = r.weight;
        existing.match = m[0];
      }
      continue;
    }
    seen.add(key);
    signals.push({ type: r.type, match: m[0], weight: r.weight });
  }
  // Questions in fresh (non-quoted) text
  if (/\?/.test(text) && !signals.some((s) => s.type === "thanks_only")) {
    const q = text.split(/(?<=[.!?\n])\s+/).find((s) => s.trim().endsWith("?"));
    if (q) signals.push({ type: "question", match: q.trim().slice(0, 200), weight: 0.4 });
  }
  return signals;
}

export function has(signals: Signal[], ...types: SignalType[]): boolean {
  return signals.some((s) => types.includes(s.type));
}

export function strongest(signals: Signal[], ...types: SignalType[]): Signal | undefined {
  return signals.filter((s) => types.includes(s.type)).sort((a, b) => b.weight - a.weight)[0];
}

export const LEAD_SIGNALS: SignalType[] = ["enquiry", "pricing_question", "quote_request", "consultation_request"];
export const COMMERCIAL_SIGNALS: SignalType[] = [
  ...LEAD_SIGNALS,
  "proposal_sent",
  "invoice_sent",
  "payment_request",
  "payment_promise",
  "payment_confirmation",
  "acceptance",
  "rejection",
  "renewal",
];
