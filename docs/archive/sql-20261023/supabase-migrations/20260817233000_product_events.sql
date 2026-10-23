create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_name text not null,
  client_event_id text not null,
  occurred_at timestamptz not null default now(),
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint product_events_name_length check (char_length(event_name) between 3 and 64),
  constraint product_events_client_id_length check (char_length(client_event_id) between 8 and 96),
  constraint product_events_user_client_unique unique (user_id, client_event_id)
);

create index if not exists product_events_user_time_idx
  on public.product_events (user_id, occurred_at desc);
create index if not exists product_events_name_time_idx
  on public.product_events (event_name, occurred_at desc);
create index if not exists product_events_source_idx
  on public.product_events ((properties->>'source'), occurred_at desc);

alter table public.product_events enable row level security;
revoke all on table public.product_events from anon, authenticated;
grant all on table public.product_events to service_role;

comment on table public.product_events is
  'First-party product funnel events. Stores bounded operational metadata only, never resume, JD, interview answers, or message content.';
