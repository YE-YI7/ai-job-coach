-- Canonical facts and durable runs for the 益职 coach harness.
-- These tables are server-only: the app uses a service-role client plus its
-- own signed session. Public Data API roles receive no privileges.

create table if not exists public.coach_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  company text not null,
  role text not null,
  stage text not null default 'captured',
  jd_text text,
  jd_version integer not null default 1 check (jd_version > 0),
  status text not null default 'active' check (status in ('active', 'won', 'lost', 'withdrawn', 'archived')),
  scheduled_interview_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  opportunity_id uuid references public.coach_opportunities(id) on delete cascade,
  source_type text not null check (source_type in ('resume', 'user_answer', 'project_note', 'mock_interview', 'real_interview', 'application', 'jd', 'other')),
  title text not null,
  content text not null,
  content_hash text not null,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, content_hash)
);

create table if not exists public.coach_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source_id uuid references public.coach_sources(id) on delete set null,
  opportunity_id uuid references public.coach_opportunities(id) on delete cascade,
  entity_type text not null check (entity_type in ('profile', 'experience', 'project', 'skill', 'metric', 'preference', 'education')),
  entity_key text not null,
  claim_type text not null,
  value jsonb not null,
  display_text text not null,
  source_excerpt text,
  status text not null default 'unverified' check (status in ('confirmed', 'unverified', 'conflicted', 'withdrawn')),
  visibility text not null default 'private' check (visibility in ('private', 'recruiter_safe', 'public')),
  valid_from date,
  valid_to date,
  supersedes_id uuid references public.coach_claims(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  opportunity_id uuid references public.coach_opportunities(id) on delete cascade,
  artifact_type text not null check (artifact_type in ('master_resume', 'target_resume', 'interview_plan', 'mock_interview', 'interview_review', 'application_answer', 'project_story', 'other')),
  parent_id uuid references public.coach_artifacts(id) on delete set null,
  version integer not null default 1 check (version > 0),
  title text not null,
  content jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'needs_confirmation', 'confirmed', 'archived')),
  context_snapshot jsonb not null default '{}'::jsonb,
  created_by text not null check (created_by in ('user', 'hosted_ai', 'personal_agent', 'system')),
  created_at timestamptz not null default now(),
  unique (parent_id, version)
);

create table if not exists public.coach_artifact_claims (
  artifact_id uuid not null references public.coach_artifacts(id) on delete cascade,
  claim_id uuid not null references public.coach_claims(id) on delete restrict,
  usage_path text not null,
  primary key (artifact_id, claim_id, usage_path)
);

create table if not exists public.coach_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  opportunity_id uuid references public.coach_opportunities(id) on delete cascade,
  action_type text not null,
  executor text not null check (executor in ('hosted_api', 'personal_agent', 'browser_extension')),
  status text not null default 'queued' check (status in ('queued', 'planning', 'running', 'awaiting_user', 'verifying', 'completed', 'failed', 'cancelled')),
  goal text not null,
  input jsonb not null default '{}'::jsonb,
  context_snapshot jsonb not null default '{}'::jsonb,
  output jsonb,
  error jsonb,
  idempotency_key text,
  requires_confirmation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

create table if not exists public.coach_run_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.coach_runs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'context_compiled', 'planned', 'tool_started', 'tool_completed', 'awaiting_user', 'verified', 'completed', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.coach_browser_commands (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.coach_runs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  opportunity_id uuid references public.coach_opportunities(id) on delete cascade,
  page_origin text not null,
  command_type text not null check (command_type in ('inspect_form', 'fill_fields', 'focus_field', 'cancel')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'claimed', 'running', 'awaiting_user', 'completed', 'failed', 'cancelled')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_opportunities_user_updated_idx on public.coach_opportunities(user_id, updated_at desc);
create index if not exists coach_sources_user_opportunity_idx on public.coach_sources(user_id, opportunity_id);
create index if not exists coach_claims_user_entity_idx on public.coach_claims(user_id, entity_type, entity_key);
create index if not exists coach_claims_opportunity_status_idx on public.coach_claims(opportunity_id, status);
create index if not exists coach_artifacts_opportunity_type_idx on public.coach_artifacts(opportunity_id, artifact_type, created_at desc);
create index if not exists coach_runs_user_status_idx on public.coach_runs(user_id, status, created_at desc);
create index if not exists coach_run_events_run_idx on public.coach_run_events(run_id, id);
create index if not exists coach_browser_commands_run_status_idx on public.coach_browser_commands(run_id, status);

alter table public.coach_opportunities enable row level security;
alter table public.coach_sources enable row level security;
alter table public.coach_claims enable row level security;
alter table public.coach_artifacts enable row level security;
alter table public.coach_artifact_claims enable row level security;
alter table public.coach_runs enable row level security;
alter table public.coach_run_events enable row level security;
alter table public.coach_browser_commands enable row level security;

revoke all privileges on public.coach_opportunities from anon, authenticated;
revoke all privileges on public.coach_sources from anon, authenticated;
revoke all privileges on public.coach_claims from anon, authenticated;
revoke all privileges on public.coach_artifacts from anon, authenticated;
revoke all privileges on public.coach_artifact_claims from anon, authenticated;
revoke all privileges on public.coach_runs from anon, authenticated;
revoke all privileges on public.coach_run_events from anon, authenticated;
revoke all privileges on public.coach_browser_commands from anon, authenticated;

grant select, insert, update, delete on public.coach_opportunities to service_role;
grant select, insert, update, delete on public.coach_sources to service_role;
grant select, insert, update, delete on public.coach_claims to service_role;
grant select, insert, update, delete on public.coach_artifacts to service_role;
grant select, insert, update, delete on public.coach_artifact_claims to service_role;
grant select, insert, update, delete on public.coach_runs to service_role;
grant select, insert, update, delete on public.coach_run_events to service_role;
grant select, insert, update, delete on public.coach_browser_commands to service_role;
grant usage, select on sequence public.coach_run_events_id_seq to service_role;
