-- Immutable, per-opportunity history and independent quality reviews.
-- All access is mediated by the application server. Public API roles have no
-- privileges even though these tables live in the public schema.

create table if not exists public.coach_opportunity_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  opportunity_id uuid not null references public.coach_opportunities(id) on delete cascade,
  snapshot_type text not null check (snapshot_type in (
    'jd', 'base_resume', 'submitted_resume', 'application_answers',
    'interview_brief', 'interview_feedback', 'outcome'
  )),
  version integer not null check (version > 0),
  title text not null,
  content jsonb not null,
  content_hash text not null,
  source_id uuid references public.coach_sources(id) on delete set null,
  artifact_id uuid references public.coach_artifacts(id) on delete set null,
  created_by text not null check (created_by in ('user', 'hosted_ai', 'personal_agent', 'system')),
  metadata jsonb not null default '{}'::jsonb,
  frozen_at timestamptz not null default now(),
  unique (opportunity_id, snapshot_type, version),
  unique (opportunity_id, snapshot_type, content_hash)
);

create table if not exists public.coach_artifact_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  opportunity_id uuid not null references public.coach_opportunities(id) on delete cascade,
  artifact_id uuid not null references public.coach_artifacts(id) on delete cascade,
  reviewer_type text not null check (reviewer_type in ('independent_ai', 'facts', 'ats', 'pdf')),
  status text not null check (status in ('passed', 'warning', 'failed', 'not_run')),
  summary text not null,
  findings jsonb not null default '[]'::jsonb,
  context_fingerprint text,
  created_at timestamptz not null default now(),
  unique (artifact_id, reviewer_type)
);

create index if not exists coach_snapshots_opportunity_type_idx
  on public.coach_opportunity_snapshots(opportunity_id, snapshot_type, version desc);
create index if not exists coach_snapshots_user_frozen_idx
  on public.coach_opportunity_snapshots(user_id, frozen_at desc);
create index if not exists coach_artifact_reviews_opportunity_idx
  on public.coach_artifact_reviews(opportunity_id, created_at desc);

alter table public.coach_opportunity_snapshots enable row level security;
alter table public.coach_artifact_reviews enable row level security;

revoke all privileges on public.coach_opportunity_snapshots from anon, authenticated;
revoke all privileges on public.coach_artifact_reviews from anon, authenticated;

grant select, insert, update, delete on public.coach_opportunity_snapshots to service_role;
grant select, insert, update, delete on public.coach_artifact_reviews to service_role;
