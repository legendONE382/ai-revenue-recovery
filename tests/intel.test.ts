import { describe, expect, it } from "vitest";
import { extractAmounts, extractDates, extractInvoiceRef, pickPrimaryAmount } from "@/lib/intel/extract";
import { prefilter } from "@/lib/intel/filter";
import { detectSignals } from "@/lib/intel/signals";
import { analyseThread, transition } from "@/lib/intel/thread";
import { scoreOpportunity } from "@/lib/intel/score";
import { validateCandidate } from "@/lib/intel/qa";
import type { NormalizedMessage } from "@/lib/intel/types";

const owner = new Set(["me@biz.com"]);
const now = new Date("2025-06-20T12:00:00Z");
const mk = (p: Partial<NormalizedMessage> & { id: string; daysAgo: number; fromEmail: string; body: string }): NormalizedMessage => ({
  providerMessageId: p.id,
  providerThreadId: "t1",
  from: { email: p.fromEmail, name: null },
  to: [p.fromEmail === "me@biz.com" ? "client@acme.com" : "me@biz.com"],
  cc: [],
  subject: p.subject ?? "Project",
  date: new Date(now.getTime() - p.daysAgo * 86400000),
  bodyText: p.body,
  snippet: p.body.slice(0, 50),
  labels: p.labels ?? [],
  headers: p.headers ?? {},
});

describe("financial extraction", () => {
  it("parses symbols, codes, thousands separators and k-suffix", () => {
    const a = extractAmounts("Total is $8,500.00, deposit £1.2k and EUR 300 plus 450 AUD.");
    expect(a.map((x) => [x.amountCents, x.currency])).toEqual([
      [850000, "USD"],
      [120000, "GBP"],
      [30000, "EUR"],
      [45000, "AUD"],
    ]);
    expect(a[0].isTotal).toBe(true);
  });
  it("ignores bare numbers and percentages", () => {
    expect(extractAmounts("We have 12 pages and 40% more traffic in 2025")).toHaveLength(0);
  });
  it("prefers labelled totals and refuses mixed currencies", () => {
    expect(pickPrimaryAmount(extractAmounts("Design $2,000, dev $3,000. The total comes to $5,000."))?.amount.amountCents).toBe(500000);
    expect(pickPrimaryAmount(extractAmounts("Either $500 or £400"))).toBeNull();
  });
  it("extracts invoice references", () => {
    expect(extractInvoiceRef("Please find attached invoice INV-2041 for")).toBe("INV-2041");
    expect(extractInvoiceRef("invoice #1188")).toBe("1188");
  });
});

describe("date extraction", () => {
  const ref = new Date("2025-03-10T12:00:00Z"); // Monday
  it("handles explicit formats", () => {
    const d = extractDates("Due 2025-04-01, or 15 March 2025, or April 3rd", ref).map((x) => x.date.toISOString().slice(0, 10));
    expect(d).toContain("2025-04-01");
    expect(d).toContain("2025-03-15");
    expect(d).toContain("2025-04-03");
  });
  it("resolves relative expressions against the message date", () => {
    const d = extractDates("Payment terms net 14. We'll pay by Friday.", ref).map((x) => x.date.toISOString().slice(0, 10));
    expect(d).toContain("2025-03-24");
    expect(d).toContain("2025-03-14");
  });
  it("rejects impossible dates", () => {
    expect(extractDates("on 31/02/2025", ref)).toHaveLength(0);
  });
});

describe("classification", () => {
  it("filters newsletters, automated notifications and auto replies", () => {
    expect(prefilter(mk({ id: "1", daysAgo: 1, fromEmail: "news@x.com", body: "hi", headers: { "list-unsubscribe": "<x>" } }), owner)).toBe("newsletter");
    expect(prefilter(mk({ id: "1", daysAgo: 1, fromEmail: "no-reply@bank.com", body: "hi" }), owner)).toBe("notification");
    expect(prefilter(mk({ id: "1", daysAgo: 1, fromEmail: "a@b.com", body: "hi", headers: { "auto-submitted": "auto-replied" } }), owner)).toBe("auto_reply");
    expect(prefilter(mk({ id: "1", daysAgo: 1, fromEmail: "a@b.com", body: "Can we talk?" }), owner)).toBe("candidate");
  });
  it("is direction-aware", () => {
    expect(detectSignals("attached is my invoice", "outbound").some((s) => s.type === "invoice_sent")).toBe(true);
    expect(detectSignals("attached is my invoice", "inbound").some((s) => s.type === "invoice_sent")).toBe(false);
  });
});

describe("state transitions", () => {
  const sig = (text: string, dir: "inbound" | "outbound") => detectSignals(text, dir);
  it("follows the commercial lifecycle", () => {
    let s = transition("new", "inbound", sig("We're interested in a new website", "inbound"));
    expect(s).toBe("new");
    s = transition(s, "outbound", sig("Thanks, happy to help", "outbound"));
    expect(s).toBe("contacted");
    s = transition(s, "outbound", sig("Please find attached our proposal", "outbound"));
    expect(s).toBe("proposal_sent");
    s = transition(s, "inbound", sig("Could we reduce the scope?", "inbound"));
    expect(s).toBe("negotiating");
    s = transition(s, "inbound", sig("Let's go ahead", "inbound"));
    expect(s).toBe("won");
    s = transition(s, "outbound", sig("Attached is the invoice", "outbound"));
    expect(s).toBe("invoiced");
    s = transition(s, "inbound", sig("We have paid today", "inbound"));
    expect(s).toBe("paid");
  });
  it("marks rejections as lost", () => {
    expect(transition("proposal_sent", "inbound", sig("We decided to go with another agency", "inbound"))).toBe("lost");
  });
});

describe("detection safety", () => {
  it("does not declare an invoice unpaid before it is due", () => {
    const a = analyseThread([mk({ id: "a", daysAgo: 5, fromEmail: "me@biz.com", body: "Attached is invoice #12 for $900, due within 30 days." })], { ownerEmails: owner, now });
    expect(a.candidates.filter((c) => c.category === "payment_followup")).toHaveLength(0);
  });
  it("labels overdue invoices as potentially overdue with explicit assumptions", () => {
    const a = analyseThread([mk({ id: "a", daysAgo: 50, fromEmail: "me@biz.com", body: "Attached is invoice #12 for $900." })], { ownerEmails: owner, now });
    const c = a.candidates.find((x) => x.category === "payment_followup")!;
    expect(c).toBeDefined();
    expect(c.title).toMatch(/may be overdue/);
    expect(c.assumptions.join(" ")).toMatch(/assumed 30-day terms/);
    expect(c.amountCents).toBe(90000);
  });
  it("respects suppressed contacts (user feedback)", () => {
    const msgs = [mk({ id: "a", daysAgo: 3, fromEmail: "client@acme.com", body: "We're interested in a website redesign. How much would it cost?" })];
    expect(analyseThread(msgs, { ownerEmails: owner, now }).candidates).toHaveLength(1);
    expect(analyseThread(msgs, { ownerEmails: owner, now, suppressedContacts: new Set(["client@acme.com"]) }).candidates).toHaveLength(0);
  });
  it("is idempotent: same input produces identical candidates", () => {
    const msgs = [mk({ id: "a", daysAgo: 3, fromEmail: "client@acme.com", body: "Could you send us a quote for the SEO project?" })];
    const a1 = analyseThread(msgs, { ownerEmails: owner, now });
    const a2 = analyseThread([...msgs].reverse(), { ownerEmails: owner, now });
    expect(JSON.stringify(a1.candidates)).toEqual(JSON.stringify(a2.candidates));
  });
});

describe("QA agent", () => {
  it("strips amounts that cannot be traced to source text", () => {
    const msgs = [mk({ id: "a", daysAgo: 3, fromEmail: "client@acme.com", body: "We're interested in a website redesign. Budget is $5,000." })];
    const a = analyseThread(msgs, { ownerEmails: owner, now });
    const forged = { ...a.candidates[0], amountCents: 9_999_900, currency: "USD" };
    const r = validateCandidate(forged, a, msgs);
    expect(r.candidate.amountCents).toBeNull();
    expect(r.issues.join()).toMatch(/Amount could not be traced/);
  });
  it("rejects evidence referencing other messages", () => {
    const msgs = [mk({ id: "a", daysAgo: 3, fromEmail: "client@acme.com", body: "We're interested in a website redesign." })];
    const a = analyseThread(msgs, { ownerEmails: owner, now });
    const forged = { ...a.candidates[0], evidence: [{ providerMessageId: "zzz", kind: "x", excerpt: "x" }] };
    expect(validateCandidate(forged, a, msgs).accepted).toBe(false);
  });
});

describe("scoring", () => {
  it("ranks larger, older payment issues higher than fresh small client questions", () => {
    const big = scoreOpportunity({ category: "payment_followup", amountCents: 500000, currency: "USD", confidence: 0.9, lastInteractionAt: new Date(now.getTime() - 20 * 864e5), dueDate: new Date(now.getTime() - 15 * 864e5), messageCount: 3, now });
    const small = scoreOpportunity({ category: "client_followup", amountCents: null, currency: null, confidence: 0.7, lastInteractionAt: new Date(now.getTime() - 1 * 864e5), dueDate: null, messageCount: 2, now });
    expect(big.score).toBeGreaterThan(small.score);
    expect(big.score).toBeLessThanOrEqual(100);
  });
});
