-- Separate sandbox/live wallets. Service-only durable exchange and AI reservation ledger.
create table public.watcha_point_wallets (
  user_id text not null, environment text not null check (environment in ('sandbox','live')),
  balance integer not null default 0 check (balance >= 0),
  primary key (user_id, environment)
);
create table public.watcha_point_transfers (
  id uuid primary key default gen_random_uuid(), user_id text not null,
  environment text not null check (environment in ('sandbox','live')), entitlement_id text not null,
  amount integer not null check (amount between 1 and 100000),
  status text not null default 'pending' check (status in ('pending','credited','cancelled')),
  created_at timestamptz not null default now(), credited_at timestamptz
);
create unique index watcha_one_pending_transfer on public.watcha_point_transfers(user_id, environment, entitlement_id) where status = 'pending';
create table public.watcha_point_reservations (
  id uuid primary key default gen_random_uuid(), user_id text not null,
  environment text not null check (environment in ('sandbox','live')), operation_id text not null,
  status text not null default 'reserved' check (status in ('reserved','committed','refunded')),
  created_at timestamptz not null default now(), finished_at timestamptz,
  unique(user_id, environment, operation_id)
);
alter table public.watcha_point_wallets enable row level security;
alter table public.watcha_point_transfers enable row level security;
alter table public.watcha_point_reservations enable row level security;
revoke all on public.watcha_point_wallets, public.watcha_point_transfers, public.watcha_point_reservations from public, anon, authenticated;
grant select, insert, update on public.watcha_point_wallets, public.watcha_point_transfers, public.watcha_point_reservations to service_role;

create function public.begin_watcha_transfer(p_user_id text, p_environment text, p_entitlement_id text, p_amount integer)
returns setof public.watcha_point_transfers language plpgsql security invoker set search_path = public as $$
begin
  insert into watcha_point_wallets(user_id, environment) values(p_user_id,p_environment) on conflict do nothing;
  perform 1 from watcha_point_wallets where user_id=p_user_id and environment=p_environment for update;
  if exists(select 1 from watcha_point_transfers where user_id=p_user_id and environment=p_environment and entitlement_id=p_entitlement_id and status='pending') then
    return query select * from watcha_point_transfers where user_id=p_user_id and environment=p_environment and entitlement_id=p_entitlement_id and status='pending';
  else
    return query insert into watcha_point_transfers(user_id,environment,entitlement_id,amount) values(p_user_id,p_environment,p_entitlement_id,p_amount) returning *;
  end if;
end $$;

create function public.credit_watcha_transfer(p_id uuid, p_user_id text, p_environment text)
returns integer language plpgsql security invoker set search_path = public as $$
declare t watcha_point_transfers%rowtype; b integer;
begin
  perform 1 from watcha_point_wallets where user_id=p_user_id and environment=p_environment for update;
  select * into t from watcha_point_transfers where id=p_id and user_id=p_user_id and environment=p_environment for update;
  if not found or t.status='cancelled' then raise exception 'invalid_transfer'; end if;
  if t.status='pending' then
    update watcha_point_wallets set balance=balance+t.amount where user_id=p_user_id and environment=p_environment;
    update watcha_point_transfers set status='credited', credited_at=now() where id=t.id;
  end if;
  select balance into b from watcha_point_wallets where user_id=p_user_id and environment=p_environment;
  return b;
end $$;

create function public.reserve_watcha_point(p_user_id text, p_environment text, p_operation_id text)
returns table(reservation_id uuid, remaining integer) language plpgsql security invoker set search_path = public as $$
declare b integer; r uuid;
begin
  select balance into b from watcha_point_wallets where user_id=p_user_id and environment=p_environment for update;
  if b is null or b<1 then return; end if;
  -- A replay never runs the model again: retry must use a new request after a refunded attempt.
  if exists(select 1 from watcha_point_reservations where user_id=p_user_id and environment=p_environment and operation_id=p_operation_id) then return; end if;
  insert into watcha_point_reservations(user_id,environment,operation_id) values(p_user_id,p_environment,p_operation_id) returning id into r;
  update watcha_point_wallets set balance=balance-1 where user_id=p_user_id and environment=p_environment;
  return query select r,b-1;
end $$;

create function public.finalize_watcha_point(p_reservation_id uuid, p_success boolean)
returns boolean language plpgsql security invoker set search_path = public as $$
declare r watcha_point_reservations%rowtype;
begin
  select * into r from watcha_point_reservations where id=p_reservation_id;
  if not found then return false; end if;
  perform 1 from watcha_point_wallets where user_id=r.user_id and environment=r.environment for update;
  select * into r from watcha_point_reservations where id=p_reservation_id for update;
  if r.status<>'reserved' then return r.status=case when p_success then 'committed' else 'refunded' end; end if;
  if not p_success then update watcha_point_wallets set balance=balance+1 where user_id=r.user_id and environment=r.environment; end if;
  update watcha_point_reservations set status=case when p_success then 'committed' else 'refunded' end, finished_at=now() where id=r.id;
  return true;
end $$;

revoke all on function public.begin_watcha_transfer(text,text,text,integer), public.credit_watcha_transfer(uuid,text,text), public.reserve_watcha_point(text,text,text), public.finalize_watcha_point(uuid,boolean) from public, anon, authenticated;
grant execute on function public.begin_watcha_transfer(text,text,text,integer), public.credit_watcha_transfer(uuid,text,text), public.reserve_watcha_point(text,text,text), public.finalize_watcha_point(uuid,boolean) to service_role;
