-- Row Level Security — defence in depth (optional; apply on Supabase or any Postgres).
--
-- The application enforces tenant isolation in every query (workspace_id scoping in
-- src/lib/data.ts and all API routes). These policies add a database-level guarantee for
-- connections that set `app.workspace_id` (e.g. a restricted reporting role, Supabase
-- PostgREST with a JWT claim mapped to app.workspace_id, or future per-request
-- `SET LOCAL app.workspace_id = '<uuid>'` inside transactions).
--
-- The main application role should be the table owner (owners bypass RLS unless FORCE is
-- used), so applying this file does not break the server; the background worker legitimately
-- needs cross-tenant access (scheduler) and runs as the owner.
--
-- Apply:  psql "$DATABASE_URL" -f db/rls.sql

create or replace function app_current_workspace() returns uuid
language sql stable as $$ select nullif(current_setting('app.workspace_id', true), '')::uuid $$;

do $$
declare t text;
begin
  foreach t in array array[
    'connected_accounts','companies','contacts','email_threads','email_messages','opportunities',
    'extracted_financial_records','follow_up_drafts','reminders','notifications','agent_execution_logs',
    'ai_provider_keys','audit_logs','user_feedback'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (workspace_id = app_current_workspace()) with check (workspace_id = app_current_workspace())', t);
  end loop;
end $$;

-- Evidence and tokens are reachable only through their parent rows.
alter table opportunity_evidence enable row level security;
drop policy if exists tenant_isolation on opportunity_evidence;
create policy tenant_isolation on opportunity_evidence using (
  exists (select 1 from opportunities o where o.id = opportunity_id and o.workspace_id = app_current_workspace())
);

alter table encrypted_oauth_tokens enable row level security;
-- No policy: non-owner roles can never read OAuth tokens, even encrypted.
