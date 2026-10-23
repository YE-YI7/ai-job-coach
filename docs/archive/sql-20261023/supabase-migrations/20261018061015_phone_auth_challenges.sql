-- No backfill, account merge, Auth-user migration, or writes to existing workspaces.
create table public.phone_auth_challenges (
  id uuid primary key,
  phone text not null check (phone ~ '^\+861[3-9][0-9]{9}$'),
  purpose text not null check (purpose in ('login', 'bind')),
  user_id uuid references public.users(id) on delete cascade,
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'sending' check (state in ('sending','sent','checking','consumed','failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  attempt_id uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  check ((purpose = 'bind' and user_id is not null) or (purpose = 'login' and user_id is null))
);
create index phone_auth_pending_client on public.phone_auth_challenges (client_hash, purpose, created_at desc);
create index phone_auth_phone_created on public.phone_auth_challenges (phone, created_at desc);
alter table public.phone_auth_challenges enable row level security;
revoke all on public.phone_auth_challenges from public, anon, authenticated;
grant select, insert, update, delete on public.phone_auth_challenges to service_role;

-- Service-role-only invoker functions: browser roles cannot execute or read challenges.
create function public.begin_phone_auth(p_id uuid, p_phone text, p_purpose text, p_user_id uuid, p_client_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing_phone text;
begin
  if p_purpose not in ('login','bind') or p_phone !~ '^\+861[3-9][0-9]{9}$'
    or p_client_hash !~ '^[0-9a-f]{64}$' or p_client_hash is null then
    return jsonb_build_object('status','invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('phone-auth:' || p_phone, 0));
  if p_purpose = 'bind' then
    select phone into existing_phone from public.users where id = p_user_id for update;
    if not found then return jsonb_build_object('status','unauthorized'); end if;
    if existing_phone is not null then return jsonb_build_object('status','already_bound'); end if;
  elsif p_user_id is not null then
    return jsonb_build_object('status','invalid');
  end if;
  -- Cooldown covers all purposes, browsers and IPs; a resend replaces old challenges.
  if exists(select 1 from public.phone_auth_challenges where phone = p_phone and created_at > now() - interval '60 seconds') then
    return jsonb_build_object('status','cooldown');
  end if;
  -- Retain no OTP at all; old challenge phone data lives at most 24h of active traffic.
  delete from public.phone_auth_challenges where created_at < now() - interval '1 day';
  update public.phone_auth_challenges set state = 'failed', attempt_id = null, lease_until = null
    where phone = p_phone and purpose = p_purpose and state in ('sending','sent','checking');
  insert into public.phone_auth_challenges(id,phone,purpose,user_id,client_hash)
    values(p_id,p_phone,p_purpose,p_user_id,p_client_hash);
  return jsonb_build_object('status','ready');
end;
$$;

create function public.claim_phone_auth(p_id uuid, p_purpose text, p_user_id uuid, p_client_hash text, p_attempt_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.phone_auth_challenges%rowtype;
begin
  select * into c from public.phone_auth_challenges where id = p_id for update;
  if not found or c.client_hash <> p_client_hash or p_client_hash is null or c.purpose <> p_purpose
    or c.user_id is distinct from p_user_id then return jsonb_build_object('status','invalid'); end if;
  if c.expires_at <= now() or c.state in ('consumed','failed','sending') or c.attempts >= 5 then
    return jsonb_build_object('status','expired');
  end if;
  if c.state = 'checking' and c.lease_until > now() then return jsonb_build_object('status','busy'); end if;
  update public.phone_auth_challenges set state = 'checking', attempts = attempts + 1,
    attempt_id = p_attempt_id, lease_until = now() + interval '30 seconds' where id = p_id;
  return jsonb_build_object('status','ready','phone',c.phone);
end;
$$;

create function public.finish_phone_auth(p_id uuid, p_purpose text, p_user_id uuid, p_client_hash text, p_attempt_id uuid, p_outcome text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.phone_auth_challenges%rowtype; u public.users%rowtype; new_user boolean := false;
begin
  -- Acquire the same phone lock before the row lock, matching resend lock order.
  select * into c from public.phone_auth_challenges where id = p_id;
  if not found then return jsonb_build_object('status','invalid'); end if;
  perform pg_advisory_xact_lock(hashtextextended('phone-auth:' || c.phone, 0));
  select * into c from public.phone_auth_challenges where id = p_id for update;
  if not found or c.client_hash <> p_client_hash or p_client_hash is null or c.purpose <> p_purpose
    or c.user_id is distinct from p_user_id or c.state <> 'checking'
    or c.attempt_id is distinct from p_attempt_id or c.expires_at <= now() or c.lease_until <= now() then
    return jsonb_build_object('status','expired');
  end if;
  if p_outcome not in ('pass','fail','error') or p_outcome is null then
    return jsonb_build_object('status','invalid');
  end if;
  if p_outcome <> 'pass' then
    update public.phone_auth_challenges set state = case when attempts >= 5 then 'failed' else 'sent' end,
      attempt_id = null, lease_until = null where id = p_id;
    return jsonb_build_object('status',case when p_outcome = 'error' then 'unavailable' else 'incorrect' end);
  end if;
  -- Consuming proof and binding/finding/creating a user happen in one transaction.
  update public.phone_auth_challenges set state = 'consumed', attempt_id = null, lease_until = null where id = p_id;
  if p_purpose = 'bind' then
    select * into u from public.users where id = p_user_id for update;
    if not found then return jsonb_build_object('status','unauthorized'); end if;
    if u.phone is not null then return jsonb_build_object('status','already_bound'); end if;
    if exists(select 1 from public.users where phone = c.phone and id <> p_user_id) then
      return jsonb_build_object('status','conflict');
    end if;
    begin
      update public.users set phone = c.phone where id = p_user_id returning * into u;
    exception when unique_violation then return jsonb_build_object('status','conflict'); end;
  else
    select * into u from public.users where phone = c.phone;
    if not found then
      insert into public.users(phone,provider) values(c.phone,'phone')
        on conflict(phone) do nothing returning * into u;
      new_user := found;
      if not new_user then select * into u from public.users where phone = c.phone; end if;
      if new_user then insert into public.user_quotas(user_id) values(u.id) on conflict(user_id) do nothing; end if;
    end if;
  end if;
  return jsonb_build_object('status','ok','user_id',u.id,'email',u.email,'is_new_user',new_user);
end;
$$;

revoke all on function public.begin_phone_auth(uuid,text,text,uuid,text) from public, anon, authenticated;
revoke all on function public.claim_phone_auth(uuid,text,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.finish_phone_auth(uuid,text,uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.begin_phone_auth(uuid,text,text,uuid,text) to service_role;
grant execute on function public.claim_phone_auth(uuid,text,uuid,text,uuid) to service_role;
grant execute on function public.finish_phone_auth(uuid,text,uuid,text,uuid,text) to service_role;
