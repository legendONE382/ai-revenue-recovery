import type { FilterCategory, NormalizedMessage } from "./types";

const AUTOMATED_LOCALPART =
  /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|notifications?|notify|alerts?|mailer[-_.]?daemon|postmaster|newsletters?|news|marketing|updates|digest|info-noreply|bounce[s]?|automated|system)([+.-].*)?$/i;

const BULK_LABELS = new Set(["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"]);

/**
 * Deterministic pre-filter. Runs before any analysis so newsletters, notifications and spam
 * never reach expensive (or external) processing.
 */
export function prefilter(msg: NormalizedMessage, ownerEmails: Set<string>): FilterCategory {
  const from = msg.from.email.toLowerCase();
  if (ownerEmails.has(from)) return "candidate"; // the user's own sent mail is always relevant context
  if (msg.labels.includes("SPAM") || msg.labels.includes("TRASH")) return "spam";

  const h = msg.headers;
  const autoSubmitted = h["auto-submitted"];
  if ((autoSubmitted && autoSubmitted.toLowerCase() !== "no") || h["x-autoreply"] || h["x-autorespond"]) return "auto_reply";
  if (/^(auto(matic)?[- ]?reply|out of (the )?office|ooo\b)/i.test(msg.subject)) return "auto_reply";

  if (h["list-unsubscribe"] || h["list-id"] || /^(bulk|list|junk)$/i.test(h["precedence"] ?? "")) return "newsletter";
  if (msg.labels.some((l) => BULK_LABELS.has(l))) return "newsletter";

  const local = from.split("@")[0] ?? "";
  if (AUTOMATED_LOCALPART.test(local)) return "notification";

  const body = msg.bodyText.toLowerCase();
  if (/unsubscribe/.test(body) && /(view (this )?(email )?in (your )?browser|manage (your )?preferences|email preferences)/.test(body)) {
    return "newsletter";
  }
  return "candidate";
}
