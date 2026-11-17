import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Database integration test: demo connector → idempotent ingestion → orchestrator →
 * opportunities, plus feedback persistence and job-queue idempotency.
 * Requires DATABASE_URL (loaded from .env). Skipped otherwise.
 */
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("pipeline (database)", async () => {
  const { db } = await import("@/db");
  const schema = await import("@/db/schema");
  const { runInitialSyncPage } = await import("@/lib/sync");
  const { analyseAllPending, analyseAndPersistThread } = await import("@/lib/agents/orchestrator");
  const { enqueue, claimJobs, completeJob } = await import("@/lib/jobs/queue");
  const { DEMO_OWNER } = await import("@/lib/fixtures/demo-emails");
  let userId = "";
  let wsId = "";
  let accountId = "";

  beforeAll(async () => {
    const [u] = await db.insert(schema.users).values({ email: `pipeline-${Date.now()}@test.local`, passwordHash: "x" }).returning();
    userId = u.id;
    const [w] = await db.insert(schema.workspaces).values({ ownerUserId: u.id, name: "Test", settings: { onboardingComplete: true } }).returning();
    wsId = w.id;
    await db.insert(schema.notificationPreferences).values({ workspaceId: w.id });
    const [a] = await db.insert(schema.connectedAccounts).values({ workspaceId: w.id, provider: "demo", email: DEMO_OWNER.email }).returning();
    accountId = a.id;
  });
  afterAll(async () => {
    if (userId) await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  it("syncs idempotently and detects the expected opportunities", async () => {
    const first = await runInitialSyncPage(accountId);
    expect(first.synced).toBeGreaterThan(20);
    await db.update(schema.syncState).set({ phase: "idle" }).where(eq(schema.syncState.connectedAccountId, accountId));
    const second = await runInitialSyncPage(accountId);
    expect(second.synced).toBe(0); // duplicate delivery is a no-op
    await analyseAllPending(wsId);
    const opps = await db.select().from(schema.opportunities).where(eq(schema.opportunities.workspaceId, wsId));
    const cats = opps.map((o) => o.category).sort();
    expect(cats).toEqual(["client_followup", "client_followup", "client_followup", "payment_followup", "payment_followup", "proposal_awaiting", "unanswered_lead", "unanswered_lead", "unanswered_lead"]);
    const ev = await db.select().from(schema.opportunityEvidence);
    expect(ev.length).toBeGreaterThan(opps.length);
    // newsletter body not stored (data minimisation)
    const news = await db.select().from(schema.emailMessages).where(and(eq(schema.emailMessages.accountId, accountId), eq(schema.emailMessages.providerMessageId, "t-newsletter-m1")));
    expect(news[0].bodyText).toBeNull();
  });

  it("keeps dismissed opportunities dismissed across re-analysis", async () => {
    const [opp] = await db.select().from(schema.opportunities).where(and(eq(schema.opportunities.workspaceId, wsId), eq(schema.opportunities.category, "proposal_awaiting")));
    const [t] = await db.select().from(schema.emailThreads).where(eq(schema.emailThreads.id, opp.threadId));
    await db.update(schema.opportunities).set({ status: "dismissed", dismissedAtMessage: t.lastMessageAt }).where(eq(schema.opportunities.id, opp.id));
    await analyseAndPersistThread(opp.threadId);
    const [after] = await db.select().from(schema.opportunities).where(eq(schema.opportunities.id, opp.id));
    expect(after.status).toBe("dismissed");
  });

  it("preserves user amount corrections across re-analysis", async () => {
    const [opp] = await db.select().from(schema.opportunities).where(and(eq(schema.opportunities.workspaceId, wsId), eq(schema.opportunities.category, "payment_followup")));
    await db.update(schema.opportunities).set({ amountCents: 123400, amountSource: "user" }).where(eq(schema.opportunities.id, opp.id));
    await analyseAndPersistThread(opp.threadId);
    const [after] = await db.select().from(schema.opportunities).where(eq(schema.opportunities.id, opp.id));
    expect(after.amountCents).toBe(123400);
  });

  it("deduplicates jobs by idempotency key and claims safely", async () => {
    const key = `test:${Date.now()}`;
    expect(await enqueue("fire_reminders", {}, { workspaceId: wsId, idempotencyKey: key, runAfter: new Date(0) })).toBe(true);
    expect(await enqueue("fire_reminders", {}, { workspaceId: wsId, idempotencyKey: key })).toBe(false);
    const jobs = await claimJobs("test-worker", 50);
    const mine = jobs.find((j) => j.idempotencyKey === key);
    expect(mine).toBeDefined();
    for (const j of jobs) await completeJob(j.id);
  });
});
