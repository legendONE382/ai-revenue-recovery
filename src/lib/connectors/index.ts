import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { connectedAccounts, encryptedOauthTokens } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { buildDemoMessages, DEMO_OWNER } from "@/lib/fixtures/demo-emails";
import { buildRawEmail, GmailAuthError, GmailClient } from "@/lib/gmail/client";
import { refreshAccessToken, TokenRevokedError } from "@/lib/gmail/oauth";
import { parseGmailMessage } from "@/lib/gmail/parse";
import type { NormalizedMessage } from "@/lib/intel/types";

/**
 * Mail provider abstraction. Adding Outlook = implementing this interface with Microsoft Graph
 * (delta queries map to `listChanges`, subscriptions map to `startWatch`).
 */
export interface MailConnector {
  provider: string;
  ownerEmails(): string[];
  /** Current change cursor (Gmail historyId). */
  currentCursor(): Promise<string | null>;
  listInitialIds(sinceDays: number, pageToken?: string): Promise<{ ids: string[]; nextPageToken?: string }>;
  getMessages(ids: string[]): Promise<NormalizedMessage[]>;
  /** Throws HistoryExpiredError when the cursor is too old. */
  listChanges(cursor: string): Promise<{ ids: string[]; cursor: string }>;
  createDraft(d: { to: string; subject: string; body: string; providerThreadId?: string; inReplyTo?: string }): Promise<string>;
  startWatch?(): Promise<{ expiration: Date; cursor: string } | null>;
  stopWatch?(): Promise<void>;
}

type Account = typeof connectedAccounts.$inferSelect;

/* ───────────────────────── Demo connector ───────────────────────── */

class DemoConnector implements MailConnector {
  provider = "demo";
  private data: NormalizedMessage[];
  constructor(private account: Account) {
    // Anchor fixture dates to the account creation time so re-syncs are stable/idempotent.
    this.data = buildDemoMessages(account.createdAt).messages;
  }
  ownerEmails() {
    return [DEMO_OWNER.email];
  }
  async currentCursor() {
    return "demo-1";
  }
  async listInitialIds() {
    return { ids: this.data.map((m) => m.providerMessageId) };
  }
  async getMessages(ids: string[]) {
    const set = new Set(ids);
    return this.data.filter((m) => set.has(m.providerMessageId));
  }
  async listChanges(cursor: string) {
    return { ids: [], cursor };
  }
  async createDraft() {
    return `demo-draft-${Date.now()}`;
  }
}

/* ───────────────────────── Gmail connector ───────────────────────── */

export class AccountRevokedError extends Error {}

class GmailConnector implements MailConnector {
  provider = "gmail";
  private client: GmailClient;
  private cachedToken: { token: string; exp: number } | null = null;
  constructor(private account: Account) {
    this.client = new GmailClient(() => this.accessToken());
  }

  private async accessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.exp > Date.now() + 60_000) return this.cachedToken.token;
    const [row] = await db.select().from(encryptedOauthTokens).where(eq(encryptedOauthTokens.connectedAccountId, this.account.id));
    if (!row) throw new AccountRevokedError("No stored credentials");
    const aad = `oauth:${this.account.id}`;
    const exp = row.accessTokenExpiresAt?.getTime() ?? 0;
    if (exp > Date.now() + 60_000) {
      this.cachedToken = { token: decrypt(row.accessTokenEnc, aad), exp };
      return this.cachedToken.token;
    }
    if (!row.refreshTokenEnc) throw new AccountRevokedError("No refresh token; reconnect required");
    try {
      const t = await refreshAccessToken(decrypt(row.refreshTokenEnc, aad));
      const newExp = new Date(Date.now() + t.expires_in * 1000);
      await db
        .update(encryptedOauthTokens)
        .set({
          accessTokenEnc: encrypt(t.access_token, aad),
          accessTokenExpiresAt: newExp,
          ...(t.refresh_token ? { refreshTokenEnc: encrypt(t.refresh_token, aad) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(encryptedOauthTokens.id, row.id));
      this.cachedToken = { token: t.access_token, exp: newExp.getTime() };
      return t.access_token;
    } catch (e) {
      if (e instanceof TokenRevokedError) {
        await db.update(connectedAccounts).set({ status: "revoked", statusMessage: "Google access was revoked or expired. Please reconnect." }).where(eq(connectedAccounts.id, this.account.id));
        throw new AccountRevokedError(e.message);
      }
      throw e;
    }
  }

  ownerEmails() {
    return [this.account.email];
  }
  async currentCursor() {
    return (await this.client.getProfile()).historyId;
  }
  async listInitialIds(sinceDays: number, pageToken?: string) {
    // Gmail-side pre-filtering saves quota; deterministic filters still run afterwards.
    const q = `newer_than:${sinceDays}d -in:chats -category:promotions -category:social -category:forums`;
    const r = await this.client.listMessages(q, pageToken, 20);
    return { ids: (r.messages ?? []).map((m) => m.id), nextPageToken: r.nextPageToken };
  }
  async getMessages(ids: string[]) {
    const out: NormalizedMessage[] = [];
    // Bounded concurrency keeps us well under per-user quota (250 units/s; messages.get = 5 units).
    for (let i = 0; i < ids.length; i += 10) {
      const batch = await Promise.all(ids.slice(i, i + 10).map((id) => this.client.getMessage(id).catch((e) => (e instanceof GmailAuthError ? Promise.reject(e) : null))));
      for (const m of batch) if (m) out.push(parseGmailMessage(m));
    }
    return out;
  }
  async listChanges(cursor: string) {
    const ids = new Set<string>();
    let pageToken: string | undefined;
    let latest = cursor;
    do {
      const r = await this.client.listHistory(cursor, pageToken);
      for (const h of r.history ?? []) for (const a of h.messagesAdded ?? []) {
        if (!(a.message.labelIds ?? []).some((l) => l === "SPAM" || l === "TRASH" || l === "DRAFT")) ids.add(a.message.id);
      }
      latest = r.historyId ?? latest;
      pageToken = r.nextPageToken;
    } while (pageToken);
    return { ids: [...ids], cursor: latest };
  }
  async createDraft(d: { to: string; subject: string; body: string; providerThreadId?: string; inReplyTo?: string }) {
    const raw = buildRawEmail({ from: this.account.email, to: d.to, subject: d.subject, body: d.body, inReplyTo: d.inReplyTo });
    const r = await this.client.createDraft(raw, d.providerThreadId);
    return r.id;
  }
  async startWatch() {
    const topic = process.env.GMAIL_PUBSUB_TOPIC;
    if (!topic) return null;
    const r = await this.client.watch(topic);
    return { expiration: new Date(Number(r.expiration)), cursor: r.historyId };
  }
  async stopWatch() {
    await this.client.stop().catch(() => undefined);
  }
}

export function getConnector(account: Account): MailConnector {
  if (account.provider === "demo") return new DemoConnector(account);
  if (account.provider === "gmail") return new GmailConnector(account);
  throw new Error(`Unsupported provider ${account.provider}`);
}

export async function loadAccount(id: string): Promise<Account | null> {
  const [a] = await db.select().from(connectedAccounts).where(eq(connectedAccounts.id, id));
  return a ?? null;
}
