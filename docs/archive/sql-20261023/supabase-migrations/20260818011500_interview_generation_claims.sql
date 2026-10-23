create table if not exists public.interview_generation_claims (
  idempotency_key text primary key check (length(idempotency_key) between 8 and 240),
  user_id uuid not null,
  session_id uuid not null,
  operation text not null check (operation in ('answer_assessment', 'session_summary')),
  status text not null default 'processing' check (status in ('processing', 'completed')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interview_generation_claims_user_created_idx
  on public.interview_generation_claims (user_id, created_at desc);

alter table public.interview_generation_claims enable row level security;
revoke all on public.interview_generation_claims from public, anon, authenticated;
grant select, insert, update, delete on public.interview_generation_claims to service_role;
