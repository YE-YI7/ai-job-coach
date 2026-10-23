create table if not exists public.public_action_rate_limits (
  scope text not null,
  key_hash text not null check (char_length(key_hash) = 64),
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash, window_started_at)
);

create index if not exists public_action_rate_limits_updated_idx
  on public.public_action_rate_limits(updated_at);

alter table public.public_action_rate_limits enable row level security;
revoke all on table public.public_action_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.public_action_rate_limits to service_role;

create or replace function public.consume_public_action_rate_limit(
  p_scope text,
  p_key_hash text,
  p_window_seconds integer,
  p_limit integer
)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  bucket_start timestamptz;
  current_count integer;
  retry_seconds integer;
begin
  if char_length(trim(p_scope)) < 3 or char_length(p_scope) > 64
    or p_key_hash !~ '^[0-9a-f]{64}$'
    or p_window_seconds < 10 or p_window_seconds > 86400
    or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid public rate limit input';
  end if;

  bucket_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  delete from public.public_action_rate_limits
    where scope = p_scope and key_hash = p_key_hash and window_started_at < bucket_start - interval '2 days';

  insert into public.public_action_rate_limits(scope, key_hash, window_started_at, request_count)
    values (p_scope, p_key_hash, bucket_start, 1)
  on conflict (scope, key_hash, window_started_at)
  do update set request_count = public.public_action_rate_limits.request_count + 1, updated_at = now()
  returning request_count into current_count;

  retry_seconds := greatest(1, ceil(extract(epoch from bucket_start + make_interval(secs => p_window_seconds) - clock_timestamp()))::integer);
  return query select current_count <= p_limit, greatest(0, p_limit - current_count), retry_seconds;
end;
$$;

revoke execute on function public.consume_public_action_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_public_action_rate_limit(text, text, integer, integer) to service_role;

comment on table public.public_action_rate_limits is
  'Hashed, server-only counters for public authentication endpoints. Stores no raw email, phone number, invite code, or IP address.';
