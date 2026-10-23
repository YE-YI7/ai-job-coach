-- Preserve the existing 5/number/day and 100/site/day caps. Reserve only after
-- the atomic challenge admission: cooldown/conflict requests must not burn SMS
-- budget. A rejected budget check rolls back admission and preserves prior OTPs.
create function public.reserve_phone_auth_send(
  p_id uuid,p_phone text,p_purpose text,p_user_id uuid,p_client_hash text,
  p_number_hash text,p_global_hash text,p_recovery boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare admission jsonb; budget record; retry_seconds integer; blocked_scope text;
begin
  if p_number_hash is null or p_number_hash !~ '^[0-9a-f]{64}$'
    or p_global_hash is null or p_global_hash !~ '^[0-9a-f]{64}$'
    or p_recovery is null or (p_recovery and p_purpose <> 'bind') then
    return jsonb_build_object('status','invalid');
  end if;
  begin
    admission := case when p_recovery then public.begin_phone_recovery(p_id,p_phone,p_purpose,p_user_id,p_client_hash)
      else public.begin_phone_auth(p_id,p_phone,p_purpose,p_user_id,p_client_hash) end;
    if admission->>'status' <> 'ready' then return admission; end if;
    select * into budget from public.consume_public_action_rate_limit('phone-send-number',p_number_hash,86400,5);
    if not budget.allowed then
      retry_seconds := budget.retry_after_seconds; blocked_scope := 'number';
      raise exception using errcode = 'YZ001', message = 'phone send budget exceeded';
    end if;
    select * into budget from public.consume_public_action_rate_limit('phone-send-global',p_global_hash,86400,100);
    if not budget.allowed then
      retry_seconds := budget.retry_after_seconds; blocked_scope := 'global';
      raise exception using errcode = 'YZ001', message = 'phone send budget exceeded';
    end if;
  exception when sqlstate 'YZ001' then
    -- PL/pgSQL subtransaction rollback includes both counters and admission.
    return jsonb_build_object('status','limited','retry_after_seconds',retry_seconds,'limit_scope',blocked_scope);
  end;
  return admission;
end;
$$;
revoke all on function public.reserve_phone_auth_send(uuid,text,text,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.reserve_phone_auth_send(uuid,text,text,uuid,text,text,text,boolean) to service_role;
