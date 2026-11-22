# Inbox Revenue Intelligence

> Turn overlooked email conversations into clear, actionable revenue opportunities.

Inbox Revenue Intelligence connects to Gmail and monitors business conversations for unanswered leads, quiet proposals, potentially overdue invoices, and follow-ups that may have slipped through the cracks. Each finding includes the evidence and transparent factors behind its priority, so you stay in control of what happens next.

![Inbox Revenue Intelligence landing page](https://github.com/legendONE382/ai-revenue-recovery/blob/master/Screenshot%20(137).png?raw=1)

## What it does

- **Find opportunities:** Surface unanswered leads, stalled proposals, possible overdue invoices, and client follow-ups.
- **Explain every finding:** Review the supporting email evidence, extracted details, and priority factors.
- **Prepare follow-ups:** Create editable drafts, with optional AI assistance or templates, and send them to Gmail as drafts.
- **Keep humans in control:** Dismiss, resolve, snooze, reopen, or correct findings; feedback is respected during later analysis.
- **Protect sensitive data:** AI features are off by default, financial values are handled deterministically, and the app provides export, disconnect, deletion, and retention workflows.

Try the product without Google credentials by creating an account and choosing **Use a sample inbox**.

## How it works

1. Connect a Gmail account or use the sample inbox.
2. The sync pipeline processes conversations and identifies relevant commercial signals.
3. Deterministic rules classify and score findings; AI interpretation is optional and limited to ambiguous threads when enabled.
4. Review the evidence and take action from the opportunity workspace.
5. Draft a follow-up when useful, then review and send it yourself.

The system does not declare invoices unpaid. It flags them as **potentially overdue**, explains any due-date assumptions, and asks the user to verify. AI does not generate financial amounts, and quality checks can remove or lower unsupported findings.

## Technology and architecture

- **Next.js and TypeScript** application with server-rendered UI and API routes.
- **Postgres** for application data and a durable job queue using row locks, idempotency, retries, and stale-job recovery.
- **Gmail API** integration with OAuth, encrypted token storage, incremental sync, optional Pub/Sub notifications, and scheduled polling fallback.
- **Deterministic-first intelligence** for filtering, extraction, classification, scoring, and financial/date handling.
- **Optional AI providers** for ambiguous classification, draft phrasing, and assistant responses—with consent, validation, and grounded outputs.

The processing pipeline is designed to be explainable: it gathers signals, extracts facts, applies lifecycle rules, checks evidence, then persists findings while respecting user feedback. Email content is treated as untrusted input, and agents do not have tools for taking actions on the user's behalf.

## Run locally

### Requirements

- Node.js and npm
- PostgreSQL

### Setup

```bash
cp .env.example .env
node scripts/generate-secrets.mjs
npm install
node scripts/migrate.mjs
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create an account, and choose **Use a sample inbox** to explore the app without configuring Google OAuth.

`DATABASE_URL` is the minimum configuration for demo mode. For Gmail integration, configure `APP_URL`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`. See `.env.example` for the full variable list and inline descriptions.

## Gmail setup

1. Create a Google Cloud project, enable the Gmail API, and configure the OAuth consent screen.
2. Create a Web application OAuth client with redirect URI `${APP_URL}/api/integrations/google/callback`.
3. Configure the requested scopes: `openid`, `email`, `gmail.readonly`, and `gmail.compose`. Draft creation can be disabled with `GMAIL_ENABLE_DRAFTS=0`.
4. Until OAuth verification is complete, only consent-screen test users can connect, and Google may show an unverified-app warning.
5. Public access requires Google OAuth and restricted-scope verification, plus the required CASA security assessment and compliance with Google's API Services User Data Policy.

Push notifications are optional. Without Pub/Sub, the scheduler polls Gmail periodically. For push, configure an authenticated Pub/Sub subscription targeting `${APP_URL}/api/webhooks/gmail` and set `GMAIL_PUBSUB_TOPIC`, `PUBSUB_AUDIENCE`, and `PUBSUB_SERVICE_ACCOUNT_EMAIL`. Gmail watches expire and must be renewed.

## Background jobs and deployment

See **[DEPLOY.md](DEPLOY.md)** for deployment options, including Vercel with Postgres, Docker Compose, and background workers on Render, Railway, Fly.io, or a VPS.

Background work is driven by `/api/cron/tick` or the long-running worker (`node scripts/worker.mjs`). Configure `CRON_SECRET` and a scheduler for recurring jobs. Pub/Sub can enqueue incremental sync jobs when configured; polling remains the fallback.

Before production, configure HTTPS, secrets, database migrations, a scheduler or worker, privacy policy and terms, and complete the applicable Google verification steps.

## Security and privacy

- Passwords are stored as scrypt hashes; session tokens are random, hashed in storage, and sent in secure, HTTP-only cookies.
- Google tokens are encrypted at rest. Mutating requests use CSRF protections, and login and API routes are rate-limited.
- Database access is scoped by workspace; optional Postgres Row Level Security policies are provided in `db/rls.sql`.
- Logs avoid email bodies and credentials. Retention, export, disconnect, and account deletion workflows are included.
- AI is opt-in. Review provider and retention settings before enabling it for real mailbox data.

Review the Gmail permissions and deployment requirements carefully before connecting a production mailbox.

## Development and tests

```bash
npx vitest run
npx vitest run tests/evaluation.test.ts
E2E_BASE_URL=http://localhost:3000 npx vitest run tests/e2e.flow.test.ts
```

The test suites cover the intelligence engine, integrations, database pipeline, labelled evaluation conversations, and an API-driven end-to-end flow. The current sample-dataset evaluation reports 100% precision and recall on 9 labelled opportunities; this is an in-sample result, not a guarantee of real-world performance. A held-out set of anonymized conversations is needed to estimate production accuracy.

## Project status

Implemented: Gmail and demo connectors, sync and background processing, explainable opportunity detection, opportunity management and feedback, follow-up drafts, optional AI assistant, analytics, notifications, and privacy/security workflows.

Planned or incomplete: Outlook integration, multi-user workspace membership and roles, attachment parsing for PDF-only proposals and invoices, browser-driven Playwright tests, and locale configuration for ambiguous dates.

Known limitations include English-focused, rule-based detection; possible misses for unusual phrasing; no visibility into payments made outside email; and Postgres-based queue/rate limiting intended for small-to-medium workloads.

## Project structure

```text
src/
  app/                 UI pages and API routes
  components/          UI components
  db/schema.ts         Drizzle schema
  lib/intel/           Filtering, extraction, signals, scoring, QA
  lib/agents/          Orchestrator, recovery, assistant
  lib/ai/               Provider adapters and versioned prompts
  lib/gmail/            OAuth, Gmail REST client, MIME and Pub/Sub
  lib/connectors/       Mail connector interface, Gmail and demo
  lib/jobs/             Queue, worker, and scheduler
  lib/sync.ts           Initial and incremental sync
  lib/data.ts           Workspace-scoped queries and analytics
drizzle/               Database migrations
db/rls.sql              Optional Row Level Security policies
scripts/worker.mjs      Long-running worker entry point
tests/                  Unit, integration, evaluation, and E2E tests
```
