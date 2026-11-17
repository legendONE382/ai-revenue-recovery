/**
 * Minimal Gmail REST client (no heavy SDK). Handles quota (429 / 403 rateLimitExceeded) and
 * transient 5xx errors with exponential backoff, and surfaces auth / history-expiry errors
 * as typed exceptions for the sync engine.
 */
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailAuthError extends Error {}
export class HistoryExpiredError extends Error {}
export class GmailApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export type GmailHeader = { name: string; value: string };
export type GmailPart = { mimeType?: string; filename?: string; headers?: GmailHeader[]; body?: { data?: string; size?: number }; parts?: GmailPart[] };
export type GmailMessage = { id: string; threadId: string; labelIds?: string[]; snippet?: string; historyId?: string; internalDate?: string; payload?: GmailPart };

export class GmailClient {
  constructor(private getToken: () => Promise<string>, private fetchFn: typeof fetch = fetch, private sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {}

  private async request<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const token = await this.getToken();
    const res = await this.fetchFn(`${BASE}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return (await res.json()) as T;
    const text = await res.text().catch(() => "");
    if (res.status === 401) throw new GmailAuthError("Gmail authorisation invalid");
    if (res.status === 404 && path.startsWith("/history")) throw new HistoryExpiredError("Gmail history id expired");
    const rateLimited = res.status === 429 || (res.status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(text));
    if ((rateLimited || res.status >= 500) && attempt < 5) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await this.sleep(retryAfter > 0 ? retryAfter * 1000 : Math.min(32_000, 1000 * 2 ** attempt + Math.random() * 500));
      return this.request<T>(path, init, attempt + 1);
    }
    if (res.status === 403 && /insufficient|PERMISSION_DENIED/i.test(text)) throw new GmailAuthError("Missing Gmail permission");
    throw new GmailApiError(`Gmail API HTTP ${res.status}`, res.status);
  }

  getProfile() {
    return this.request<{ emailAddress: string; historyId: string; messagesTotal: number }>("/profile");
  }

  listMessages(q: string, pageToken?: string, maxResults = 100) {
    const p = new URLSearchParams({ q, maxResults: String(maxResults) });
    if (pageToken) p.set("pageToken", pageToken);
    return this.request<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(`/messages?${p}`);
  }

  getMessage(id: string) {
    return this.request<GmailMessage>(`/messages/${encodeURIComponent(id)}?format=full`);
  }

  listHistory(startHistoryId: string, pageToken?: string) {
    const p = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded", maxResults: "500" });
    if (pageToken) p.set("pageToken", pageToken);
    return this.request<{ history?: { messagesAdded?: { message: { id: string; threadId: string; labelIds?: string[] } }[] }[]; historyId: string; nextPageToken?: string }>(
      `/history?${p}`,
    );
  }

  watch(topicName: string) {
    return this.request<{ historyId: string; expiration: string }>("/watch", {
      method: "POST",
      body: JSON.stringify({ topicName, labelIds: ["INBOX", "SENT"], labelFilterBehavior: "INCLUDE" }),
    });
  }

  stop() {
    return this.request<Record<string, never>>("/stop", { method: "POST" });
  }

  createDraft(raw: string, threadId?: string) {
    return this.request<{ id: string; message: { id: string; threadId: string } }>("/drafts", {
      method: "POST",
      body: JSON.stringify({ message: { raw, ...(threadId ? { threadId } : {}) } }),
    });
  }
}

/** RFC 2822 message, base64url encoded, for drafts.create. Header values are sanitised against CRLF injection. */
export function buildRawEmail(o: { from: string; to: string; subject: string; body: string; inReplyTo?: string; references?: string }): string {
  const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
  const subject = `=?UTF-8?B?${Buffer.from(clean(o.subject)).toString("base64")}?=`;
  const lines = [
    `From: ${clean(o.from)}`,
    `To: ${clean(o.to)}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  if (o.inReplyTo) lines.push(`In-Reply-To: ${clean(o.inReplyTo)}`, `References: ${clean(o.references ?? o.inReplyTo)}`);
  return Buffer.from(`${lines.join("\r\n")}\r\n\r\n${o.body.replace(/\r?\n/g, "\r\n")}`).toString("base64url");
}
