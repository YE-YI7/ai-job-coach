-- Private administrator evidence only. No changes to identities, answers or wallets.
create table public.coach_eval_feedback (
  id uuid primary key,
  run_id uuid not null references public.coach_eval_runs(id) on delete restrict,
  actor_user_id uuid not null,
  subject_user_id uuid not null,
  resume_trace_id uuid,
  change_id text,
  scope text not null check (scope in ('change', 'whole_document')),
  category text not null check (category in ('format','quality','grounding','questioning','system','other')),
  verdict text not null check (verdict in ('improve','fail','pass')),
  note text not null check (length(note) between 1 and 6000),
  expected text not null default '' check (length(expected) <= 6000),
  status text not null default 'open' check (status in ('open','diagnosed','fixed','verified')),
  content_hash text not null check (length(content_hash) = 64),
  created_at timestamptz not null default now(),
  check ((scope = 'change' and change_id is not null and length(change_id) between 1 and 180)
    or (scope = 'whole_document' and change_id is null))
);
create index coach_eval_feedback_run_created_idx on public.coach_eval_feedback(run_id, created_at desc);
create index coach_eval_feedback_created_idx on public.coach_eval_feedback(created_at desc);
alter table public.coach_eval_feedback enable row level security;
revoke all on public.coach_eval_feedback from anon, authenticated;
grant select, insert on public.coach_eval_feedback to service_role;

create table public.coach_eval_batches (
  id uuid primary key,
  actor_user_id uuid not null,
  label text not null check (length(label) between 1 and 120),
  status text not null default 'running' check (status in ('running','completed','failed','partial')),
  config jsonb not null default '{}' check (octet_length(config::text) <= 100000),
  summary jsonb not null default '{}' check (octet_length(summary::text) <= 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coach_eval_batches_created_idx on public.coach_eval_batches(created_at desc);
-- Bounded experiment listing avoids reading every private prompt/result in the system.
create index coach_eval_runs_batch_idx on public.coach_eval_runs ((run->'experiment'->>'batchId'))
  where run->'experiment'->>'batchId' is not null;
alter table public.coach_eval_batches enable row level security;
revoke all on public.coach_eval_batches from anon, authenticated;
grant select, insert, update on public.coach_eval_batches to service_role;
