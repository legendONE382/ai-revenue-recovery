# Deploying Inbox Revenue Intelligence

You need three things running: **the web app**, **a Postgres database** and **a scheduler** that calls `/api/cron/tick` every few minutes. Choose one of the options below, then work through the [post-deploy checklist](#post-deploy-checklist).

```bash
cp .env.example .env
node scripts/generate-secrets.mjs     # paste TOKEN_ENCRYPTION_KEY and CRON_SECRET into .env
```

Back up `TOKEN_ENCRYPTION_KEY` in a password manager. If you lose it, every user has to reconnect Gmail.

---

## Option A: Vercel + Neon/Supabase + GitHub Actions (free tiers)

1. **Database.** Create a Postgres database on [Neon](https://neon.tech) or [Supabase](https://supabase.com) and copy the **pooled** connection string.
   - Neon: use it as-is (it includes `sslmode=require`). Set `DATABASE_SSL=require`.
   - Supabase: use the *Transaction pooler* string (port 6543). Remove any `?sslmode=…` and set `DATABASE_SSL=no-verify`.
   - Set `DATABASE_POOL_MAX=2`.
2. **Push the repo to GitHub**, then import it in Vercel (framework preset: Next.js). `vercel.json` already sets the build command to `node scripts/migrate.mjs && next build`, so migrations run on every deploy.
3. **Environment variables** (Vercel › Project › Settings › Environment Variables): everything from your `.env`. Set `APP_URL` to your Vercel URL or custom domain, for example `https://revenue.example.com`.

4. **Deploy.**
5. **Scheduler.** On the Hobby plan, Vercel Cron runs at most once a day; `vercel.json` registers a daily run as a backup. For the real schedule, add the repo secrets `APP_URL` and `CRON_SECRET` (GitHub › Settings › Secrets and variables › Actions). The included workflow `.github/workflows/scheduler.yml` then calls the tick every 5 minutes. GitHub may delay scheduled runs; jobs are idempotent, so that's fine.

## Option B: your own server with Docker (VPS, home server)

```bash
# .env: set APP_URL=https://your-domain and the secrets; DATABASE_URL is set by compose
docker compose up -d --build
```
- This starts Postgres, the app (port 3000, migrations run automatically on start) and an always-on **worker**. You don't need any other scheduler.
- Put a TLS reverse proxy in front. For example, Caddy: `your-domain { reverse_proxy localhost:3000 }`.
- Testing over plain http on localhost? Set `INSECURE_COOKIES=1`, otherwise login cookies won't stick.

## Option C: Render / Railway / Fly.io

- **Web service:** build with the `Dockerfile`. It runs migrations, then `next start`, and has a healthcheck at `/api/health`.
- **Worker:** a second service from the same image with start command `node scripts/worker.mjs` and `APP_URL` pointing at the web service. If you'd rather not run a worker, use the GitHub Actions scheduler from Option A.
- **Postgres:** use the platform's managed Postgres, or Neon/Supabase.

---

## Google / Gmail setup (for real mailboxes)

The app works fully without this, using the sample inbox.

1. [Google Cloud Console](https://console.cloud.google.com): create a project and enable the **Gmail API**.
2. **OAuth consent screen:** set the user type to External. Add the app name, support email, and your domain's homepage, `/privacy` and `/terms` URLs. Add the scopes `gmail.readonly` and `gmail.compose`. Add yourself (and up to 99 others) as **Test users**.
3. **Credentials:** Create OAuth client ID → Web application → Authorised redirect URI `https://YOUR_DOMAIN/api/integrations/google/callback`. Copy the ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. **Optional push notifications:** see the Pub/Sub section in `.env.example`. Without them, new mail is polled every 15 minutes.
5. **Public launch:** both scopes are *restricted*. Before anyone other than your test users can connect, you need OAuth verification, restricted-scope review and an annual CASA security assessment. Until then, test users see an "unverified app" screen. That's expected.

## Email (password reset and notification emails)

Create a [Resend](https://resend.com) account, verify your domain, and set `RESEND_API_KEY` and `EMAIL_FROM` (an address on that domain). Without these, "Forgot password" is disabled and notifications are in-app only.

---

## Post-deploy checklist

1. Open `https://YOUR_DOMAIN/api/health` and check it returns `{"ok":true,…}`.
2. Register an account, finish onboarding, and connect the **sample inbox** to confirm the full pipeline works.
3. **Settings › Deployment status:** every required item should be green, and *Background scheduler* should show a recent run within a few minutes.
4. Connect your Gmail (as a test user). **Integrations** should show the initial sync progressing.
5. Fill in `OPERATOR_NAME` and `CONTACT_EMAIL` so the Terms and Privacy pages name you, and have both reviewed before public launch.
6. Optional: apply row-level security as defence in depth with `node scripts/migrate.mjs --rls`.

## Updating

Redeploy as usual. Migrations in `./drizzle` run automatically: in the Vercel build step, and on container start for Docker. After changing `src/db/schema.ts`, run `npx drizzle-kit generate --name <change>` and commit the new SQL file.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Can't stay logged in | Using http? Set `INSECURE_COOKIES=1` (local only). Otherwise check `APP_URL` matches the domain you're visiting. |
| "Cross-origin request rejected" | `APP_URL` doesn't match the browser's domain, or a proxy is rewriting the `Host` header. |
| `self-signed certificate` DB error | Set `DATABASE_SSL=no-verify` and remove `sslmode` from `DATABASE_URL`. |
| Migration fails with "already exists" | The database was created with `drizzle-kit push`. Use a fresh database, or keep using `npx drizzle-kit push`. |
| Google "redirect_uri_mismatch" | The redirect URI in Google Cloud must be exactly `${APP_URL}/api/integrations/google/callback`. |
| Gmail shows "revoked" | The user removed access, or the token expired (unverified apps' refresh tokens expire after 7 days in Testing mode). Reconnect, or publish the app. |
| No new opportunities appearing | Check *Background scheduler* in Settings › Deployment status. |
