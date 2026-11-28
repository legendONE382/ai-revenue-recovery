import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();

/* ───────────────────────── Identity ───────────────────────── */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("password_reset_user_idx").on(t.userId)],
);

export type WorkspaceSettings = {
  onboardingComplete?: boolean;
  /** Owner consent for sending email content to external AI providers. Default false. */
  aiProcessingAllowed?: boolean;
  /** Preferred provider order, e.g. ["gemini","groq"]. */
  aiProviderOrder?: string[];
  monitoringDays?: number;
  leadResponseHours?: number;
  proposalInactivityDays?: number;
  paymentGraceDays?: number;
  followUpDays?: number;
  retentionDays?: number;
  signature?: string;
};

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  name: text("name").notNull(),
  settings: jsonb("settings").$type<WorkspaceSettings>().notNull().default({}),
  createdAt: createdAt(),
});

/* ───────────────────────── Integrations ───────────────────────── */

export const connectedAccounts = pgTable(
  "connected_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // 'gmail' | 'demo' | future 'outlook'
    email: text("email").notNull(),
    status: text("status").notNull().default("active"), // active | revoked | error | disconnected
    scopes: text("scopes"),
    statusMessage: text("status_message"),
    watchExpiration: ts("watch_expiration"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("connected_accounts_ws_provider_email").on(t.workspaceId, t.provider, t.email)],
);

export const encryptedOauthTokens = pgTable("encrypted_oauth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectedAccountId: uuid("connected_account_id")
    .notNull()
    .unique()
    .references(() => connectedAccounts.id, { onDelete: "cascade" }),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  keyVersion: integer("key_version").notNull().default(1),
  updatedAt: createdAt(),
});

export const syncState = pgTable("synchronisation_state", {
  connectedAccountId: uuid("connected_account_id")
    .primaryKey()
    .references(() => connectedAccounts.id, { onDelete: "cascade" }),
  phase: text("phase").notNull().default("idle"), // idle | initial | incremental | error
  historyId: text("history_id"),
  pageToken: text("page_token"),
  messagesSynced: integer("messages_synced").notNull().default(0),
  threadsAnalysed: integer("threads_analysed").notNull().default(0),
  lastSyncAt: ts("last_sync_at"),
  lastNotificationAt: ts("last_notification_at"),
  lastError: text("last_error"),
  startedAt: ts("started_at"),
  completedAt: ts("completed_at"),
});

/* ───────────────────────── Email data ───────────────────────── */

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    name: text("name"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("companies_ws_domain").on(t.workspaceId, t.domain)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    /** User feedback: never raise opportunities for this sender. */
    suppressed: boolean("suppressed").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("contacts_ws_email").on(t.workspaceId, t.email)],
);

export const emailThreads = pgTable(
  "email_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => connectedAccounts.id, { onDelete: "cascade" }),
    providerThreadId: text("provider_thread_id").notNull(),
    subject: text("subject"),
    primaryContactId: uuid("primary_contact_id").references(() => contacts.id, { onDelete: "set null" }),
    lastMessageAt: ts("last_message_at"),
    messageCount: integer("message_count").notNull().default(0),
    classification: text("classification"), // commercial | newsletter | notification | personal | spam | other
    conversationStatus: text("conversation_status"), // awaiting_business | awaiting_contact | closed | no_action
    analysis: jsonb("analysis").$type<Record<string, unknown>>(),
    analysisHash: text("analysis_hash"),
    analysedAt: ts("analysed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("email_threads_account_provider").on(t.accountId, t.providerThreadId),
    index("email_threads_ws_last").on(t.workspaceId, t.lastMessageAt),
  ],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => connectedAccounts.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").notNull().references(() => emailThreads.id, { onDelete: "cascade" }),
    providerMessageId: text("provider_message_id").notNull(),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    toEmails: text("to_emails").array().notNull().default(sql`'{}'::text[]`),
    ccEmails: text("cc_emails").array().notNull().default(sql`'{}'::text[]`),
    subject: text("subject"),
    snippet: text("snippet"),
    bodyText: text("body_text"),
    sentAt: ts("sent_at").notNull(),
    direction: text("direction").notNull(), // inbound | outbound
    labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
    headers: jsonb("headers").$type<Record<string, string>>(),
    filterCategory: text("filter_category"),
    signals: jsonb("signals").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("email_messages_account_provider").on(t.accountId, t.providerMessageId),
    index("email_messages_thread_idx").on(t.threadId, t.sentAt),
    index("email_messages_ws_idx").on(t.workspaceId),
  ],
);

/* ───────────────────────── Opportunities ───────────────────────── */

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").notNull().references(() => emailThreads.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    /** unanswered_lead | proposal_awaiting | payment_followup | client_followup */
    category: text("category").notNull(),
    /** new | contacted | proposal_sent | negotiating | invoiced | won | lost | dormant | paid */
    stage: text("stage").notNull().default("new"),
    /** open | snoozed | dismissed | resolved */
    status: text("status").notNull().default("open"),
    resolution: text("resolution"), // won | lost | paid | not_relevant | handled
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }),
    currency: text("currency"),
    amountSource: text("amount_source"), // extracted | user
    confidence: real("confidence").notNull(),
    priorityScore: integer("priority_score").notNull().default(0),
    priorityFactors: jsonb("priority_factors").$type<Record<string, number>>(),
    recommendedAction: text("recommended_action"),
    lastInteractionAt: ts("last_interaction_at"),
    dueDate: ts("due_date"),
    snoozedUntil: ts("snoozed_until"),
    userOverrides: jsonb("user_overrides").$type<Record<string, unknown>>().notNull().default({}),
    /** Hash of the thread state that produced this record; used to suppress duplicate notifications. */
    stateHash: text("state_hash"),
    /** Latest message timestamp at dismissal; re-open only if newer evidence appears. */
    dismissedAtMessage: ts("dismissed_at_message"),
    recoveredAmountCents: bigint("recovered_amount_cents", { mode: "number" }),
    detectedAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [
    uniqueIndex("opportunities_thread_category").on(t.threadId, t.category),
    index("opportunities_ws_status").on(t.workspaceId, t.status, t.priorityScore),
  ],
);

export const opportunityEvidence = pgTable(
  "opportunity_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => emailMessages.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    excerpt: text("excerpt").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("opportunity_evidence_opp_idx").on(t.opportunityId)],
);

export const extractedFinancialRecords = pgTable(
  "extracted_financial_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").notNull().references(() => emailThreads.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").notNull().references(() => emailMessages.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // quote | proposal | invoice | payment_promise | payment_confirmation | price_mention
    amountCents: bigint("amount_cents", { mode: "number" }),
    currency: text("currency"),
    rawText: text("raw_text").notNull(),
    dueDate: ts("due_date"),
    reference: text("reference"),
    confidence: real("confidence").notNull(),
    status: text("status").notNull().default("extracted"), // extracted | user_corrected | rejected
    createdAt: createdAt(),
  },
  (t) => [
    index("financial_ws_idx").on(t.workspaceId),
    uniqueIndex("financial_message_kind_raw").on(t.messageId, t.kind, t.rawText),
  ],
);

/* ───────────────────────── Recovery ───────────────────────── */

export const followUpDrafts = pgTable(
  "follow_up_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("draft"), // draft | gmail_draft_created | sent_confirmed | discarded
    providerDraftId: text("provider_draft_id"),
    generatedBy: text("generated_by").notNull(),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("drafts_ws_idx").on(t.workspaceId, t.status)],
);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
    remindAt: ts("remind_at").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"), // pending | fired | cancelled
    createdAt: createdAt(),
  },
  (t) => [index("reminders_due_idx").on(t.status, t.remindAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    readAt: ts("read_at"),
    emailedAt: ts("emailed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notifications_ws_dedupe").on(t.workspaceId, t.dedupeKey),
    index("notifications_ws_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const notificationPreferences = pgTable("notification_preferences", {
  workspaceId: uuid("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
  newOpportunity: boolean("new_opportunity").notNull().default(true),
  overdueFollowUp: boolean("overdue_follow_up").notNull().default(true),
  proposalInactivity: boolean("proposal_inactivity").notNull().default(true),
  paymentReminder: boolean("payment_reminder").notNull().default(true),
  dailySummary: boolean("daily_summary").notNull().default(true),
  /** Also deliver notifications by email (batched; requires an email provider on the server). */
  emailNotifications: boolean("email_notifications").notNull().default(true),
  minPriority: integer("min_priority").notNull().default(30),
});

/* ───────────────────────── Agents & jobs ───────────────────────── */

export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("queued"), // queued | running | succeeded | failed | dead
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAfter: ts("run_after").notNull().defaultNow(),
    lockedAt: ts("locked_at"),
    lockedBy: text("locked_by"),
    idempotencyKey: text("idempotency_key").unique(),
    lastError: text("last_error"),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [index("agent_tasks_claim_idx").on(t.status, t.runAfter)],
);

export const agentExecutionLogs = pgTable(
  "agent_execution_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").references(() => agentTasks.id, { onDelete: "set null" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    agent: text("agent").notNull(),
    targetRef: text("target_ref"),
    status: text("status").notNull(), // ok | error | skipped
    output: jsonb("output").$type<Record<string, unknown>>(),
    provider: text("provider"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("agent_logs_ws_idx").on(t.workspaceId, t.createdAt)],
);

export const aiProviderKeys = pgTable(
  "ai_provider_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    keyEnc: text("key_enc").notNull(),
    model: text("model"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ai_keys_ws_provider").on(t.workspaceId, t.provider)],
);

/* ───────────────────────── Governance ───────────────────────── */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_ws_idx").on(t.workspaceId, t.createdAt)],
);

export const userFeedback = pgTable(
  "user_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // false_positive | correction | resolved | snoozed | suppress_sender
    field: text("field"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    createdAt: createdAt(),
  },
  (t) => [index("feedback_ws_idx").on(t.workspaceId)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
});

/* --------------------------------- Business profile --------------------------------- */

export const businessProfiles = pgTable(
  "business_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }).unique(),
    businessName: text("business_name"),
    businessType: text("business_type"),
    industry: text("industry"),
    profession: text("profession"),
    role: text("role"),
    description: text("description"),
    website: text("website"),
    country: text("country"),
    location: text("location"),
    timezone: text("timezone"),
    preferredCurrency: text("preferred_currency"),
    targetCustomerTypes: text("target_customer_types").array().notNull().default(sql`'{}'::text[]`),
    targetIndustries: text("target_industries").array().notNull().default(sql`'{}'::text[]`),
    targetMarkets: text("target_markets").array().notNull().default(sql`'{}'::text[]`),
    acceptedEnquiryTypes: text("accepted_enquiry_types").array().notNull().default(sql`'{}'::text[]`),
    excludedEnquiryTypes: text("excluded_enquiry_types").array().notNull().default(sql`'{}'::text[]`),
    businessGoals: text("business_goals").array().notNull().default(sql`'{}'::text[]`),
    inboxPurpose: text("inbox_purpose"),
    typicalDealSize: text("typical_deal_size"),
    salesCycle: text("sales_cycle"),
    paymentTerms: text("payment_terms"),
    businessHours: text("business_hours"),
    communicationTone: text("communication_tone"),
    emailSignature: text("email_signature"),
    profileStatus: text("profile_status").notNull().default("draft"), // draft | complete | skipped
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("business_profiles_ws_idx").on(t.workspaceId)],
);

export const businessOfferings = pgTable(
  "business_offerings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").notNull().references(() => businessProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    targetCustomer: text("target_customer"),
    priceRange: text("price_range"),
    currency: text("currency"),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("business_offerings_profile_idx").on(t.profileId)],
);

export const businessProfileFacts = pgTable(
  "business_profile_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").notNull().references(() => businessProfiles.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    source: text("source").notNull().default("ai"), // user | ai | email
    confidence: real("confidence").notNull().default(0.5),
    status: text("status").notNull().default("suggested"), // confirmed | suggested | rejected
    evidenceMessageIds: uuid("evidence_message_ids").array().notNull().default(sql`'{}'::uuid[]`),
    evidenceThreadIds: uuid("evidence_thread_ids").array().notNull().default(sql`'{}'::uuid[]`),
    firstObservedAt: ts("first_observed_at").notNull().defaultNow(),
    lastObservedAt: ts("last_observed_at").notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("business_profile_facts_profile_key").on(t.profileId, t.category, t.key)],
);

export const emailIntelligence = pgTable(
  "email_intelligence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").notNull().references(() => emailMessages.id, { onDelete: "cascade" }).unique(),
    threadId: uuid("thread_id").references(() => emailThreads.id, { onDelete: "cascade" }),
    primaryCategory: text("primary_category").notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    summary: text("summary"),
    senderClassification: text("sender_classification"),
    communicationIntent: text("communication_intent"),
    importance: text("importance").notNull().default("low"), // low | medium | high | critical
    actionRequired: boolean("action_required").notNull().default(false),
    recommendedAction: text("recommended_action"),
    businessRelevance: text("business_relevance").notNull().default("none"), // none | low | medium | high
    offeringId: uuid("offering_id").references(() => businessOfferings.id, { onDelete: "set null" }),
    relevanceExplanation: text("relevance_explanation"),
    confidence: real("confidence").notNull().default(0.5),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    analysisStatus: text("analysis_status").notNull().default("pending"), // pending | done | skipped | failed
    analysisVersion: text("analysis_version").notNull().default("1"),
    analysedAt: ts("analysed_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("email_intelligence_ws_idx").on(t.workspaceId),
    index("email_intelligence_thread_idx").on(t.threadId),
  ],
);

export const businessInsights = pgTable(
  "business_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    confidence: real("confidence").notNull().default(0.5),
    source: text("source").notNull().default("ai"), // ai | system | user
    status: text("status").notNull().default("active"), // active | dismissed | corrected
    firstObservedAt: ts("first_observed_at").notNull().defaultNow(),
    lastUpdatedAt: ts("last_updated_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("business_insights_ws_idx").on(t.workspaceId)],
);
