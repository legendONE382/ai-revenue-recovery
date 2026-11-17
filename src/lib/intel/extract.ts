import type { DateMention, MoneyMention } from "./types";

/* ───────────────────────── Money ───────────────────────── */

const SYMBOLS: Record<string, string> = { $: "USD", "£": "GBP", "€": "EUR", "¥": "JPY", "₹": "INR" };
const CODES = "USD|GBP|EUR|AUD|CAD|NZD|CHF|SGD|INR|JPY|ZAR|SEK|NOK|DKK";
const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?`;

const MONEY_RE = new RegExp(
  String.raw`(?:(?<pfxcode>A|C|NZ|US)?(?<sym>[$£€¥₹])\s?(?<n1>${NUM})\s?(?<k1>k|K|m|M)?\b(?:\s?(?<sfx1>${CODES})\b)?)` +
    String.raw`|(?:\b(?<code2>${CODES})\s?(?<n2>${NUM})\s?(?<k2>k|K)?\b)` +
    String.raw`|(?:\b(?<n3>${NUM})\s?(?<k3>k|K)?\s?(?<code3>${CODES}|dollars|pounds|euros)\b)`,
  "g",
);

function toCents(n: string, k?: string): number {
  const v = parseFloat(n.replace(/,/g, ""));
  const mult = k ? (k.toLowerCase() === "k" ? 1_000 : 1_000_000) : 1;
  return Math.round(v * mult * 100);
}

const WORD_CURRENCY: Record<string, string> = { dollars: "USD", pounds: "GBP", euros: "EUR" };

export function extractAmounts(text: string): MoneyMention[] {
  const out: MoneyMention[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const g = m.groups ?? {};
    let currency: string;
    let cents: number;
    if (g.sym) {
      const prefix = g.pfxcode;
      currency = g.sfx1 ?? (prefix && g.sym === "$" ? (prefix === "US" ? "USD" : `${prefix === "A" ? "AUD" : prefix === "C" ? "CAD" : "NZD"}`) : SYMBOLS[g.sym]);
      cents = toCents(g.n1, g.k1);
    } else if (g.code2) {
      currency = g.code2;
      cents = toCents(g.n2, g.k2);
    } else {
      currency = WORD_CURRENCY[g.code3?.toLowerCase()] ?? g.code3;
      cents = toCents(g.n3, g.k3);
    }
    if (!Number.isFinite(cents) || cents <= 0) continue;
    const idx = m.index ?? 0;
    const before = text.slice(Math.max(0, idx - 40), idx).toLowerCase();
    out.push({
      amountCents: cents,
      currency,
      raw: m[0].trim(),
      index: idx,
      isTotal: /(total|in total|overall|all[- ]in|grand total|comes to|amount due|balance( due)?|fee of|for a fee of)\W*(is|of|:|would be|will be)?\W*$/.test(before),
    });
  }
  return out;
}

/** Deterministic choice of the commercially relevant amount from a message. */
export function pickPrimaryAmount(amounts: MoneyMention[]): { amount: MoneyMention; method: string } | null {
  if (amounts.length === 0) return null;
  const totals = amounts.filter((a) => a.isTotal);
  if (totals.length > 0) return { amount: totals[totals.length - 1], method: "Amount labelled as total in the message" };
  if (amounts.length === 1) return { amount: amounts[0], method: "Single amount stated in the message" };
  const currencies = new Set(amounts.map((a) => a.currency));
  if (currencies.size > 1) return null; // mixed currencies — refuse to guess
  const max = amounts.reduce((a, b) => (b.amountCents > a.amountCents ? b : a));
  return { amount: max, method: "Largest of several amounts in the message (no explicit total)" };
}

/* ───────────────────────── Dates ───────────────────────── */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function utcDate(y: number, m: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, m, d, 12));
  return dt.getUTCMonth() === m && dt.getUTCDate() === d ? dt : null;
}

function inferYear(m: number, d: number, ref: Date): number {
  // A date without a year is assumed to be the closest occurrence to the reference (within ~6 months).
  const y = ref.getUTCFullYear();
  const cand = utcDate(y, m, d);
  if (!cand) return y;
  const diff = cand.getTime() - ref.getTime();
  const sixMonths = 183 * 86400000;
  if (diff > sixMonths) return y - 1;
  if (diff < -sixMonths) return y + 1;
  return y;
}

function addDays(ref: Date, days: number): Date {
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + days, 12));
}

/**
 * Extracts explicit and relative dates. Relative expressions are resolved against the
 * message timestamp (`ref`) — never against "now" — so re-processing is deterministic.
 */
export function extractDates(text: string, ref: Date): DateMention[] {
  const out: DateMention[] = [];
  const t = text.toLowerCase();
  const push = (date: Date | null, raw: string, confidence: number, kind: DateMention["kind"]) => {
    if (date) out.push({ date, raw, confidence, kind });
  };

  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) push(utcDate(+m[1], +m[2] - 1, +m[3]), m[0], 0.95, "explicit");

  for (const m of t.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/g)) {
    const a = +m[1], b = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    if (a > 12) push(utcDate(y, b - 1, a), m[0], 0.9, "explicit");
    else if (b > 12) push(utcDate(y, a - 1, b), m[0], 0.9, "explicit");
    else push(utcDate(y, b - 1, a), m[0], 0.6, "explicit"); // ambiguous: assume day-first (configurable later)
  }

  const md = new RegExp(String.raw`\b${MONTH_RE}\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b`, "g");
  for (const m of t.matchAll(md)) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3));
    const d = +m[2];
    const y = m[3] ? +m[3] : inferYear(mi, d, ref);
    push(utcDate(y, mi, d), m[0], m[3] ? 0.95 : 0.85, "explicit");
  }
  const dm = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?${MONTH_RE}(?:,?\s+(\d{4}))?\b`, "g");
  for (const m of t.matchAll(dm)) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3));
    const d = +m[1];
    const y = m[3] ? +m[3] : inferYear(mi, d, ref);
    push(utcDate(y, mi, d), m[0], m[3] ? 0.95 : 0.85, "explicit");
  }

  if (/\btomorrow\b/.test(t)) push(addDays(ref, 1), "tomorrow", 0.8, "relative");
  if (/\bnext week\b/.test(t)) push(addDays(ref, 7), "next week", 0.5, "relative");
  if (/\bend of (the |this )?month\b/.test(t)) {
    push(new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0, 12)), "end of the month", 0.7, "relative");
  }
  if (/\bend of (the |this )?week\b/.test(t)) {
    const diff = (5 - ref.getUTCDay() + 7) % 7;
    push(addDays(ref, diff), "end of the week", 0.7, "relative");
  }
  for (const m of t.matchAll(/\b(?:within|in)\s+(\d{1,3})\s+(day|week)s?\b/g)) {
    push(addDays(ref, +m[1] * (m[2] === "week" ? 7 : 1)), m[0], 0.75, "relative");
  }
  for (const m of t.matchAll(/\bnet\s?-?(\d{1,3})\b/g)) push(addDays(ref, +m[1]), m[0], 0.8, "relative");
  for (const m of t.matchAll(/\b(?:by|on|this|next|until|before)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g)) {
    const target = WEEKDAYS.indexOf(m[1]);
    let diff = (target - ref.getUTCDay() + 7) % 7;
    if (diff === 0) diff = 7;
    if (m[0].startsWith("next") && diff < 7) diff += 0; // "next friday" is ambiguous; keep nearest and lower confidence
    push(addDays(ref, diff), m[0], m[0].startsWith("next") ? 0.55 : 0.7, "relative");
  }
  return out;
}

/* ───────────────────────── Other facts ───────────────────────── */

export function extractInvoiceRef(text: string): string | null {
  const m =
    text.match(/\binvoice\s*(?:#|no\.?|number|ref\.?)\s*:?\s*([A-Z0-9][A-Z0-9-]{1,20})\b/i) ??
    text.match(/\binvoice\s+([A-Z]{0,6}-?\d[A-Z0-9-]{1,18})\b/i);
  return m ? m[1].toUpperCase() : null;
}

export function extractQuestions(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.endsWith("?") && s.length > 8 && s.length < 400);
}

/** Excerpt around an index, used for evidence display. */
export function excerptAround(text: string, index: number, radius = 110): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

export function formatMoney(cents: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currency ?? "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency ?? ""}`.trim();
  }
}
