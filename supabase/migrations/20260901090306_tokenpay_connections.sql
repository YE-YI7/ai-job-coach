-- TokenPay stores a user-authorized TokenDance key as application-layer
-- ciphertext. Browser roles never receive direct access to either table.

create table if not exists public.tokenpay_connections (
  user_id uuid primary key references public.users(id) on delete cascade,
  encrypted_api_key text not null,
  key_fingerprint text not null,
  status text not null default 'active' check (status in ('active', 'reauthorize', 'disconnected')),
  credits_microyuan bigint,
  credits_used_microyuan bigint,
  balance_microyuan bigint,
  connected_at timestamptz not null default now(),
  last_checked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.tokenpay_payment_sessions (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  amount_yuan integer not null check (amount_yuan between 1 and 100000),
  status text not null check (status in ('pending', 'paid', 'failed', 'closed', 'refunded')),
  payment_url text not null,
  expired_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tokenpay_payment_sessions_user_created_idx
  on public.tokenpay_payment_sessions(user_id, created_at desc);

alter table public.tokenpay_connections enable row level security;
alter table public.tokenpay_payment_sessions enable row level security;

revoke all on public.tokenpay_connections from public, anon, authenticated;
revoke all on public.tokenpay_payment_sessions from public, anon, authenticated;

grant select, insert, update, delete on public.tokenpay_connections to service_role;
grant select, insert, update, delete on public.tokenpay_payment_sessions to service_role;
