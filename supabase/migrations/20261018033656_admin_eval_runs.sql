-- Remote migration version verified after MCP apply; local stub was created by CLI.
-- Separate from product_events: opt-in administrator evals may include the
-- administrator's submitted sample and visible model messages, never hidden reasoning.
create table public.coach_eval_runs (
  id uuid primary key,
  user_id uuid not null,
  label text not null check (char_length(label) between 1 and 120),
  status text not null default 'running',
  legacy_trace_id uuid,
  run jsonb not null check (octet_length(run::text) <= 1500000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coach_eval_runs_created_idx on public.coach_eval_runs (created_at desc);
alter table public.coach_eval_runs enable row level security;
revoke all on public.coach_eval_runs from anon, authenticated;
grant select, insert, update, delete on public.coach_eval_runs to service_role;
comment on table public.coach_eval_runs is 'Explicit administrator sample evals only; private service access, no normal-user prompt capture. No hidden reasoning. No automatic retention deletion.';
