create table if not exists public.ai_generation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  operation text not null default 'unclassified',
  request_id text,
  provider text not null,
  model text not null,
  status text not null check (status in ('success', 'error', 'stub')),
  latency_ms integer not null check (latency_ms >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  cache_hit_tokens integer not null default 0 check (cache_hit_tokens >= 0),
  cache_miss_tokens integer not null default 0 check (cache_miss_tokens >= 0),
  estimated_cost_usd numeric(14, 8),
  pricing_version text,
  failure_type text,
  knowledge_document_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.ai_generation_events enable row level security;
revoke all on public.ai_generation_events from anon, authenticated;

create index if not exists ai_generation_events_user_created_idx
  on public.ai_generation_events (user_id, created_at desc);
create index if not exists ai_generation_events_operation_created_idx
  on public.ai_generation_events (operation, created_at desc);
create index if not exists ai_generation_events_failure_created_idx
  on public.ai_generation_events (failure_type, created_at desc)
  where status = 'error';
