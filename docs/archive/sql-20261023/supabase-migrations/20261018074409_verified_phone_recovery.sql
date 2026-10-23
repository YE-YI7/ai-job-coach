-- Additive, opt-in recovery. No backfill, deletion, balance merge or workspace move.
alter table public.phone_auth_challenges add column allow_recovery boolean not null default false;
create table public.phone_account_recoveries (
  challenge_id uuid primary key,
  source_user_id uuid not null references public.users(id),
  target_user_id uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  check(source_user_id <> target_user_id)
);
alter table public.phone_account_recoveries enable row level security;
create index phone_account_recoveries_source on public.phone_account_recoveries(source_user_id);
create index phone_account_recoveries_target on public.phone_account_recoveries(target_user_id);
revoke all on public.phone_account_recoveries from public,anon,authenticated;
grant select,insert on public.phone_account_recoveries to service_role;

create function public.begin_phone_recovery(p_id uuid,p_phone text,p_purpose text,p_user_id uuid,p_client_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  if p_purpose is distinct from 'bind' or p_user_id is null then return jsonb_build_object('status','invalid'); end if;
  if not exists(select 1 from public.users where id=p_user_id and provider in ('watcha','email','invite')) then
    return jsonb_build_object('status','original_account_required');
  end if;
  result:=public.begin_phone_auth(p_id,p_phone,'bind',p_user_id,p_client_hash);
  if result->>'status'='ready' then update public.phone_auth_challenges set allow_recovery=true where id=p_id; end if;
  return result;
end;
$$;

create function public.finish_phone_recovery(p_id uuid,p_purpose text,p_user_id uuid,p_client_hash text,p_attempt_id uuid,p_outcome text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.phone_auth_challenges%rowtype; source_user public.users%rowtype;
  target_user public.users%rowtype; result jsonb; ref record; has_data boolean;
begin
  select * into c from public.phone_auth_challenges where id=p_id;
  if not found then return jsonb_build_object('status','invalid'); end if;
  perform pg_advisory_xact_lock(hashtextextended('phone-auth:'||c.phone,0));
  select * into c from public.phone_auth_challenges where id=p_id for update;
  if not c.allow_recovery or p_purpose is distinct from 'bind' or c.purpose<>'bind'
    or p_user_id is null or c.user_id is distinct from p_user_id or p_client_hash is null
    or c.client_hash<>p_client_hash or c.state<>'checking' or c.attempt_id is distinct from p_attempt_id
    or c.expires_at<=now() or c.lease_until is null or c.lease_until<=now() then
    return jsonb_build_object('status','expired');
  end if;
  -- Failed provider checks use the unchanged retry/attempt/lease machinery.
  if p_outcome is distinct from 'pass' then
    return public.finish_phone_auth(p_id,p_purpose,p_user_id,p_client_hash,p_attempt_id,p_outcome);
  end if;
  select * into target_user from public.users where id=p_user_id for update;
  if not found or target_user.provider is null or target_user.provider not in ('watcha','email','invite') then
    return jsonb_build_object('status','original_account_required');
  end if;
  if target_user.phone is not null then return jsonb_build_object('status','already_bound'); end if;
  select * into source_user from public.users where phone=c.phone for update;
  if not found then return public.finish_phone_auth(p_id,p_purpose,p_user_id,p_client_hash,p_attempt_id,p_outcome); end if;
  if source_user.id=p_user_id or source_user.provider is distinct from 'phone' or source_user.email is not null
    or source_user.invite_code is not null then return jsonb_build_object('status','account_has_data'); end if;
  perform 1 from public.user_quotas where user_id=source_user.id for update;
  if exists(select 1 from public.user_quotas where user_id=source_user.id and
    (paid_chat_remaining<>0 or paid_resume_remaining<>0 or paid_interview_remaining<>0
      or free_chat_daily<>3 or free_resume_daily<>1)) then return jsonb_build_object('status','account_has_data'); end if;
  -- Fail closed on any owned public row, including future feature tables. Only
  -- default quotas, telemetry and OTP challenges are non-user-content fixtures.
  for ref in
    select distinct cols.table_name,cols.column_name from information_schema.columns cols
    where cols.table_schema='public' and cols.column_name in ('user_id','redeemed_by','owner_id')
      and cols.data_type='uuid' and cols.table_name not in ('users','user_quotas','product_events','phone_auth_challenges')
    union
    select cls.relname,att.attname from pg_catalog.pg_constraint con
      join pg_catalog.pg_class cls on cls.oid=con.conrelid
      join pg_catalog.pg_namespace ns on ns.oid=cls.relnamespace
      join pg_catalog.pg_attribute att on att.attrelid=cls.oid and att.attnum=con.conkey[1]
    where con.contype='f' and con.confrelid='public.users'::regclass and ns.nspname='public'
      and array_length(con.conkey,1)=1 and cls.relname not in ('user_quotas','product_events','phone_auth_challenges')
  loop
    execute format('select exists(select 1 from public.%I where %I=$1)',ref.table_name,ref.column_name)
      into has_data using source_user.id;
    if has_data then return jsonb_build_object('status','account_has_data'); end if;
  end loop;
  -- One transaction: releasing the unused login and binding the verified target.
  -- The source row/session stays separate; it never gains access to old data.
  begin
    update public.users set phone=null where id=source_user.id and phone=c.phone;
    result:=public.finish_phone_auth(p_id,p_purpose,p_user_id,p_client_hash,p_attempt_id,p_outcome);
    if result->>'status'<>'ok' then raise exception 'PHONE_RECOVERY_NOT_COMMITTED'; end if;
    insert into public.phone_account_recoveries(challenge_id,source_user_id,target_user_id) values(p_id,source_user.id,p_user_id);
    return result||jsonb_build_object('recovered',true);
  exception when unique_violation or check_violation or raise_exception then
    return jsonb_build_object('status','conflict');
  end;
end;
$$;
revoke all on function public.begin_phone_recovery(uuid,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.finish_phone_recovery(uuid,text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.begin_phone_recovery(uuid,text,text,uuid,text) to service_role;
grant execute on function public.finish_phone_recovery(uuid,text,uuid,text,uuid,text) to service_role;
notify pgrst, 'reload schema';
