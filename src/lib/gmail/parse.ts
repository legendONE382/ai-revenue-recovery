import type { NormalizedMessage } from "@/lib/intel/types";
import type { GmailMessage, GmailPart } from "./client";

const KEEP_HEADERS = ["list-unsubscribe", "list-id", "precedence", "auto-submitted", "x-autoreply", "x-autorespond", "message-id", "references", "in-reply-to"];

export function parseAddress(v: string): { email: string; name: string | null } {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { email: m[2].trim().toLowerCase(), name: m[1].trim() || null };
  return { email: v.trim().toLowerCase(), name: null };
}

export function parseAddressList(v: string | undefined): string[] {
  if (!v) return [];
  // split on commas not inside quotes
  return v
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((x) => parseAddress(x).email)
    .filter((e) => e.includes("@"));
}

function decode(data?: string): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

function findPart(part: GmailPart | undefined, mime: string): GmailPart | undefined {
  if (!part) return undefined;
  if (part.mimeType === mime && part.body?.data && !part.filename) return part;
  for (const p of part.parts ?? []) {
    const f = findPart(p, mime);
    if (f) return f;
  }
  return undefined;
}

/** Removes quoted history so each message is analysed on what it newly says. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^On .{5,200}wrote:\s*$/.test(l) || (/^On .{5,200}$/.test(l) && /wrote:\s*$/.test(lines[i + 1] ?? ""))) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(l)) break;
    if (/^From:\s.+/.test(l) && /^(Sent|Date):\s.+/.test(lines[i + 1] ?? "")) break;
    if (/^_{10,}$/.test(l.trim())) break;
    if (/^>/.test(l)) continue;
    out.push(l);
  }
  return out.join("\n").trim();
}

export function parseGmailMessage(m: GmailMessage): NormalizedMessage {
  const headers: Record<string, string> = {};
  const all: Record<string, string> = {};
  for (const h of m.payload?.headers ?? []) {
    const k = h.name.toLowerCase();
    all[k] = h.value;
    if (KEEP_HEADERS.includes(k)) headers[k] = h.value.slice(0, 500);
  }
  const plain = findPart(m.payload, "text/plain");
  const html = findPart(m.payload, "text/html");
  let body = plain ? decode(plain.body?.data) : html ? htmlToText(decode(html.body?.data)) : decode(m.payload?.body?.data);
  if (!plain && !html && m.payload?.mimeType === "text/html") body = htmlToText(body);
  const date = m.internalDate ? new Date(Number(m.internalDate)) : new Date(all["date"] ?? Date.now());
  return {
    providerMessageId: m.id,
    providerThreadId: m.threadId,
    from: parseAddress(all["from"] ?? ""),
    to: parseAddressList(all["to"]),
    cc: parseAddressList(all["cc"]),
    subject: (all["subject"] ?? "").slice(0, 500),
    date,
    bodyText: stripQuoted(body).slice(0, 20_000),
    snippet: (m.snippet ?? "").slice(0, 300),
    labels: m.labelIds ?? [],
    headers,
  };
}
