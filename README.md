# Inbox Revenue Intelligence

> Find the revenue opportunities hiding in your inbox. Never let another potential customer, proposal or payment slip through the cracks.

A SaaS application that connects to Gmail and keeps watching a business's commercial email conversations in the background. It finds **unanswered leads, quiet proposals, potentially overdue invoices and forgotten client follow-ups**. It ranks them using transparent factors, shows the exact evidence behind each finding, and prepares follow-up drafts for the user to review. It never sends email on its own.

---

## 1. Architecture

```
               ┌────────────────────────── Next.js (App Router) ──────────────────────────┐
 Browser ──────│ UI (server components)  ·  API route handlers (auth, CSRF, rate limits)  │
               │                                                                          │
 Google OAuth ─│ /api/integrations/google/{start,callback}  (PKCE + session-bound state)  │
 Pub/Sub push ─│ /api/webhooks/gmail  (OIDC JWT verify → enqueue idempotent job → 204)    │
 Scheduler ────│ /api/cron/tick       (Bearer CRON_SECRET → schedule + run worker)        │
               └───────────────┬──────────────────────────────────────────────────────────┘
                               │
             ┌─────────────────▼─────────────────┐       ┌───────────────────────────────┐
             │ Job queue (agent_tasks, Postgres) │──────▶│ Worker (runWorker)            │
             │ idempotency keys · SKIP LOCKED    │       │ initial_sync · incremental    │
             │ retries/backoff · stale-lock      │       │ analyse_thread · reevaluate   │
             │ recovery · dead-letter            │       │ renew_watches · reminders     │
             └───────────────────────────────────┘       │ daily_summary · retention     │
                                                         └──────────────┬────────────────┘
      ┌────────────────────────────┐                                    │
      │ MailConnector interface    │◀── sync engine (src/lib/sync.ts) ◀─┤
      │  GmailConnector (REST)     │    initial (paged, resumable)      │
      │  DemoConnector (fixtures)  │    incremental (History API)       │
      │  (Outlook: future)         │    expired history → safe resync   │
      └────────────────────────────┘                                    │
                                                                        ▼
  ┌───────────────────────────── Master Orchestrator (agents/orchestrator.ts) ─────────────────────────┐
  │ 1 Email Understanding (deterministic: filter → signals → extraction → state machine)               │
  │ 2 Lead / Proposal / Payment / Follow-up detection (deterministic rules, intel/thread.ts)           │
  │ 3 AI interpretation — ONLY ambiguous threads, ONLY with consent, cached per thread hash            │
  │ 4 Quality Assurance (evidence grounding, verbatim amounts, consistency) — can only remove/lower    │
  │ 5 Persist with lifecycle rules (respects dismissals, corrections, snoozes) · notifications · logs  │
  └────────────────────────────────────────────────────────────────────────────────────────────────────┘
      Recovery Agent (drafts, on demand) · Assistant (intent routing + retrieval, optional LLM phrasing)
```

### Why these choices
| Decision | Reason |
|---|---|
| **Postgres job queue** instead of Redis/BullMQ | One-business inbox volumes are small. `FOR UPDATE SKIP LOCKED` gives safe concurrency without extra infrastructure. |
| **No vector DB** | Retrieval is structured (opportunities, contacts, categories). Relational queries answer every assistant question we support. |
| **Deterministic-first intelligence** | Free, explainable, testable and private. Most emails never reach an LLM. |
| **Custom email/password auth** (scrypt + DB sessions) instead of Supabase Auth | The preview environment is plain Postgres. Sessions are httpOnly, SameSite=Lax and stored hashed. Swapping to Supabase Auth only touches `src/lib/auth.ts`. |
| **No googleapis SDK** | A ~150-line REST client gives explicit control over quota backoff and error types, and keeps the bundle small. |

### The agents (each has one explicit job)
| Agent | Implementation | Uses LLM? |
|---|---|---|
| Email Understanding | `intel/filter.ts`, `intel/signals.ts`, `intel/extract.ts`, `transition()` | Only for ambiguous threads with consent (`classify.v2`) |
| Lead Detection | `analyseThread` §A | No |
| Proposal Tracking | `analyseThread` §B | No |
| Payment Intelligence | `analyseThread` §C | No |
| Follow-up Intelligence | `analyseThread` §D | No |
| Quality Assurance | `intel/qa.ts` | No |
| Recovery | `agents/recovery.ts` | Optional (`draft.v3`), with output guards. Falls back to templates |
| Master Orchestrator | `agents/orchestrator.ts` + `jobs/worker.ts` | No |
| Assistant | `agents/assistant.ts` | Optional phrasing, grounded on retrieved records, amount-verified |

Every run is logged to `agent_execution_logs`: agent, target, status, provider/model, prompt version, tokens and duration. The logs contain no email bodies.

### Key rules enforced in code
- **Financial values and date comparisons are always deterministic.** LLMs never produce amounts. QA strips any amount that doesn't appear verbatim in the source.
- **Invoices are never declared "unpaid".** They are flagged as "may be overdue" only after the stated, promised or assumed due date plus a grace period. The assumption is shown, and the user is reminded that payment may have happened without an email.
- **Direction-aware signals.** "Attached is my invoice" counts as a receivable only when the business sent it, so supplier invoices are ignored.
- **Feedback changes later processing.** Dismissed findings stay dismissed until new messages arrive. Sender suppression excludes a contact from detection. Amount and stage corrections survive every re-analysis.
- **Prompt-injection defence.** Email content is wrapped in untrusted-data delimiters, and delimiter spoofing is stripped. Agents have no tools. Outputs are schema-validated and checked against the source. Instruction-like content is flagged in the UI.

---

## 2. Project structure
```
src/
  app/                    UI pages (landing, auth, onboarding, /app/*) and API routes
  components/             UI components (server + client)
  db/schema.ts            Drizzle schema (20 tables)
  lib/
    intel/                Pure intelligence engine (types, filter, extract, signals, thread, score, qa)
    agents/               orchestrator, recovery, assistant
    ai/                   provider adapters, versioned prompts, DB-aware runner
    gmail/                oauth, REST client, MIME parser, Pub/Sub JWT verification
    connectors/           MailConnector interface + Gmail & Demo implementations
    jobs/                 queue + worker/scheduler
    sync.ts               initial/incremental sync, ingestion, watch renewal
    data.ts               workspace-scoped queries + analytics
    auth.ts http.ts crypto.ts audit.ts notifications.ts
  lib/fixtures/demo-emails.ts   labelled sample mailbox (demo mode + evaluation)
drizzle/                  generated SQL migrations
db/rls.sql                optional Row Level Security policies
scripts/worker.mjs        long-running worker loop for always-on hosts
tests/                    unit, integration, DB, evaluation and E2E tests
```

---

## 3. Setup

> **Deploying?** Follow **[DEPLOY.md](DEPLOY.md)**. It covers Vercel + Neon/Supabase + GitHub Actions (free), Docker Compose, and Render/Railway/Fly.

```bash
cp .env.example .env                  # every variable is documented inline
node scripts/generate-secrets.mjs     # TOKEN_ENCRYPTION_KEY + CRON_SECRET
npm install
node scripts/migrate.mjs              # apply ./drizzle migrations (add --rls for Row Level Security)
npm run dev
```
Open http://localhost:3000, create an account, and choose **Use a sample inbox** to try the whole product without Google credentials.

### Environment variables
See `.env.example`. Minimum for demo mode: `DATABASE_URL`. For Gmail you also need `APP_URL`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. For background processing you need `CRON_SECRET` plus a scheduler. Push notifications need the `GMAIL_PUBSUB_TOPIC` and `PUBSUB_*` variables. AI provider keys are optional.

### Database migrations
- Schema source: `src/db/schema.ts`
- Generate a migration after changes: `npx drizzle-kit generate --name <change>`
- Apply: `npx drizzle-kit migrate`
- Gmail message/thread IDs are unique per connected account; financial records are unique per (message, kind, raw text); opportunities are unique per (thread, category).

---

## 4. Google configuration and verification (read before launch)

1. Create a Google Cloud project, enable the **Gmail API**, and configure the OAuth consent screen.
2. Create an OAuth client of type *Web application* with redirect URI `${APP_URL}/api/integrations/google/callback`.
3. Scopes requested: `openid`, `email`, `gmail.readonly` (**restricted**) and `gmail.compose` (**restricted**, used only to create drafts; set `GMAIL_ENABLE_DRAFTS=0` to drop it).
4. **Unverified apps:** until verification, only test users listed on the consent screen can connect (maximum 100), and they will see an "unverified app" warning. *This app is not verified, and nothing in this repository claims otherwise.*
5. **Public launch requires:**
   - OAuth app verification (domain ownership, privacy policy URL, a demo video of scope usage).
   - Restricted-scope verification.
   - An annual third-party **CASA security assessment** (Tier 2/3, via a Google-approved assessor; this is a paid engagement).
   - Compliance with the Google API Services User Data Policy, including **Limited Use**.
6. **Push notifications (optional; otherwise the scheduler polls every 15 minutes):**
   - Create a Pub/Sub topic and grant `gmail-api-push@system.gserviceaccount.com` the *Pub/Sub Publisher* role on it.
   - Create an **authenticated push** subscription to `${APP_URL}/api/webhooks/gmail`, using a service account and an audience.
   - Set `GMAIL_PUBSUB_TOPIC`, `PUBSUB_AUDIENCE` and `PUBSUB_SERVICE_ACCOUNT_EMAIL`.
   - Watches expire after 7 days and are renewed daily by the `renew_watches` job.

---

## 5. Background processing and deployment

All background work goes through `/api/cron/tick`, which enqueues recurring jobs (idempotent per time bucket) and then runs the worker for about 50 seconds. Jobs are resumable: initial sync processes one page per job. That keeps every job well within serverless time limits.

| Host | How to run jobs | Notes |
|---|---|---|
| **Vercel Hobby (free)** + Supabase/Neon Postgres (free) | Vercel Cron on Hobby runs **at most once a day**, which is not enough. Use a free external scheduler (GitHub Actions `schedule`, or cron-job.org) to `POST /api/cron/tick` with `Authorization: Bearer $CRON_SECRET` every 5 minutes. | Webhooks also run work via `after()`. Function duration is limited, which is why jobs are paged. |
| **Render / Railway / Fly.io / VPS** | Run `node scripts/worker.mjs` as a background worker next to the web service. | Most reliable option. A free Render web service sleeps, so pair it with an always-on worker or external pings. |
| Any | Pub/Sub push → webhook → idempotent `incremental_sync` job keyed by `historyId` | Duplicate deliveries are no-ops. |

Recurring jobs:
- `fire_reminders`: every 5 minutes.
- `incremental_sync` polling fallback: every 15 minutes per Gmail account.
- `reevaluate_workspace`: every 6 hours. This catches time-based changes such as invoices passing their due date.
- `renew_watches`, `daily_summary` and `purge_retention`: daily.

Failed jobs retry with exponential backoff (up to 5 attempts) and then move to `dead`. Jobs locked for more than 10 minutes are reclaimed.

Production checklist:
- HTTPS
- `APP_URL` set
- `TOKEN_ENCRYPTION_KEY` held in a secrets manager
- `CRON_SECRET` set
- A scheduler configured
- Migrations applied
- Privacy policy and terms published
- Google verification completed

---

## 6. Security model
- **Authentication:** scrypt password hashes. Random 256-bit session tokens, stored only as SHA-256 hashes, in httpOnly + Secure + SameSite=Lax cookies with a 14-day expiry.
- **CSRF:** SameSite cookies plus a strict Origin/Referer check on every mutation. OAuth uses `state` bound to the session hash, plus PKCE.
- **Token storage:** AES-256-GCM, with the account ID as associated data (a ciphertext can't be moved to another account). The key lives only in the environment. Tokens never reach the browser and are never logged.
- **Rate limiting:** Postgres fixed-window limits per user and route, and per IP/email for login and registration.
- **Webhooks:** Pub/Sub OIDC JWT verification (RS256 against Google JWKS; issuer, audience, expiry and service account checked), plus an optional shared token. Cron uses a bearer secret compared in constant time.
- **Tenant isolation:** every query is scoped by `workspace_id`, with optional RLS policies in `db/rls.sql`.
- **Headers:** CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy and COOP.
- **Logging:** error messages only; no email bodies or credentials. The audit log covers logins, connections, AI consent changes, actions, exports and deletions.
- **Data minimisation:** newsletter, notification and spam bodies are never stored. Bodies are purged after the retention period (default 180 days).

### Privacy workflows
- **Disconnect:** stops the watch, revokes the Google grant, deletes tokens, and optionally purges all synced data.
- **Export:** JSON download from Settings. Credentials are excluded.
- **Delete account:** revokes grants, then cascades deletion of every record.
- **AI disclosure:** off by default. Explicit opt-in during onboarding and in Settings, with retention caveats for providers' free tiers. Users can supply their own keys, which are stored encrypted.

---

## 7. Testing

```bash
npx vitest run                                   # all suites (DB suite uses DATABASE_URL)
npx vitest run tests/evaluation.test.ts          # precision / recall report
E2E_BASE_URL=http://localhost:3000 npx vitest run tests/e2e.flow.test.ts   # against a running build
```

| Suite | Covers |
|---|---|
| `intel.test.ts` | money/date/invoice extraction, filtering, direction-aware classification, state transitions, overdue logic and assumptions, suppression feedback, idempotency, QA grounding, scoring |
| `integrations.test.ts` | Gemini/OpenAI-compatible adapters (retry, fallback, schema-failure fallback), injection delimiter stripping, Gmail client (quota backoff, 401, expired history), MIME parsing and quote stripping, header-injection-safe drafts, OAuth URL/PKCE, Pub/Sub JWT verification (valid, forged, expired, wrong audience, wrong account), AES-GCM tampering, draft guards |
| `pipeline.db.test.ts` | demo connector → idempotent ingestion (re-sync adds 0) → orchestrator → expected opportunities, data minimisation, dismissal persistence, correction persistence, job deduplication and claiming |
| `evaluation.test.ts` | precision/recall over 19 labelled conversations, including misleading cases (personal money talk, supplier invoice, Stripe notification, newsletter with prices, prompt injection, thank-you endings, accepted deal) |
| `e2e.flow.test.ts` | register → CSRF rejection → connect → sync → detect → assistant → draft → provider draft → resolve → export (no secrets) → delete |

**Current measured result on the sample dataset:** opportunity detection precision **100%**, recall **100%** (9/9, 0 false positives); thread classification accuracy **100%**.
*Caveat:* the rules were calibrated against this dataset, so this is an in-sample measurement. A held-out set of real, anonymised conversations is needed to estimate real-world accuracy. The in-app false-positive rate (Analytics) tracks this in production.

---

## 8. Status

### Completed
- Email/password accounts, sessions, onboarding with permission explanation, monitoring preferences, AI consent and progress.
- Gmail OAuth (PKCE, offline access, revocation), encrypted token storage, refresh and revoked-credential detection.
- Initial sync (paged, resumable, quota-aware), incremental History API sync, expired-history resync, Pub/Sub webhook with JWT verification, daily watch renewal, polling fallback.
- Deterministic intelligence engine, four detection categories, lifecycle stages, priority scoring with explainable factors, QA agent, evidence and methodology on every finding.
- Dashboard, opportunity feed with filters, search and sort, opportunity workspace (evidence, conversation, extracted facts, priority breakdown), conversations view showing per-message signals.
- Dismiss (with sender suppression), resolve, snooze (with reminder), reopen, and correct amount/stage, all persisted as `user_feedback` and respected by re-analysis.
- Follow-up drafts (AI with guards, or templates), editing, Gmail draft creation, "I've sent it" confirmation.
- AI assistant over real data, which can only create drafts.
- In-app notifications (new, reopened, payment, proposal, reminders, daily summary) with dedupe keys and preferences.
- Analytics with four strictly separated financial figures, outcomes, false-positive rate, and agent/AI usage.
- Provider-independent AI layer (Gemini, Groq, Mistral, OpenAI) with per-task models, fallback, retries, validation, usage logging, prompt versions and user keys.
- Security headers, CSRF protection, rate limiting, audit log, export, disconnect and deletion, retention purge, RLS policies file.

- Password reset by email, profile and password change (other sessions are signed out), and batched email notification digests via Resend.
- Deployment: Dockerfile, docker-compose (Postgres + app + worker), Vercel config, GitHub Actions scheduler and CI, migration runner, secret generator, startup config check, in-app Deployment status panel.
- Terms page, 404/error/loading states, favicon, robots rules.

### Outstanding / next
- Outlook connector (Microsoft Graph delta queries and subscriptions) via the `MailConnector` interface.
- Multi-user workspaces (the schema is workspace-scoped; membership and roles are not built yet).
- Attachment parsing: proposals and invoices sent only as PDFs have no extractable amount. The UI says so rather than guessing.
- Browser-driven UI E2E tests (Playwright). The current E2E test drives the HTTP API.
- Date-format locale setting: ambiguous `03/04/2025` currently assumes day-first and gets lower confidence.

### Known limitations
- Detection is English-language and rule-based. Unusual phrasing may be missed unless AI interpretation is enabled.
- "Potentially overdue" can't see payments made outside email. Users are told to verify.
- The rate limiter and job queue are Postgres-based, which suits small and medium scale. Revisit at high volume.
- Company names are not inferred; only the email domain is shown, to avoid inventing information.

### Required external configuration (currently blocked without it)
| Needed for | Configuration |
|---|---|
| Real Gmail connection | Google Cloud project, OAuth client, `GOOGLE_CLIENT_ID/SECRET`, `APP_URL`, `TOKEN_ENCRYPTION_KEY`. Test users only until verification. |
| Public Gmail access | Google OAuth verification, restricted-scope review and a CASA assessment (not done) |
| Real-time updates | Pub/Sub topic and authenticated push subscription (`GMAIL_PUBSUB_TOPIC`, `PUBSUB_*`) |
| Background jobs without user traffic | `CRON_SECRET` + a scheduler, or `scripts/worker.mjs` |
| AI features | A provider key (server-managed or user-supplied) **and** workspace opt-in |
