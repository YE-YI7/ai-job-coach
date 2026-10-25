-- Server-only homepage preview budget. No user, answer, quota or point writes.
-- An inner exception block rolls ALL counters back when any one gate denies.
create function public.consume_landing_mentor_budget(
  p_ip_key_hash text,
  p_global_key_hash text,
  p_intent_key_hash text
)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  gate record;
  current_count integer;
  bucket_start timestamptz;
  retry_seconds integer;
begin
  if p_ip_key_hash is null or p_ip_key_hash !~ '^[0-9a-f]{64}$'
    or p_global_key_hash is null or p_global_key_hash !~ '^[0-9a-f]{64}$'
    or p_intent_key_hash is null or p_intent_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid landing budget identity';
  end if;
  -- One clock value for all gates, including requests crossing midnight.
  bucket_start:=to_timestamp(floor(extract(epoch from clock_timestamp())/86400)*86400);
  retry_seconds:=greatest(1,ceil(extract(epoch from bucket_start+interval '1 day'-clock_timestamp()))::integer);

  begin
    -- Stable lock order: IP, global, intent. The upsert locks each counter row.
    for gate in select * from (values
      (1,'landing-mentor-ip',p_ip_key_hash,3),
      (2,'landing-mentor-global',p_global_key_hash,20),
      (3,'landing-mentor-once',p_intent_key_hash,1)
    ) as gates(ordinal,scope,key_hash,maximum) order by ordinal loop
      insert into public.public_action_rate_limits(scope,key_hash,window_started_at,request_count)
        values(gate.scope,gate.key_hash,bucket_start,1)
      on conflict(scope,key_hash,window_started_at) do update
        set request_count=public.public_action_rate_limits.request_count+1,updated_at=now()
      returning request_count into current_count;
      if current_count>gate.maximum then raise sqlstate 'PZL01'; end if;
    end loop;
  exception when sqlstate 'PZL01' then
    return query select false, 0, retry_seconds;
    return;
  end;
  return query select true, 0, retry_seconds;
end;
$$;

revoke all on function public.consume_landing_mentor_budget(text,text,text)
  from public, anon, authenticated;
grant execute on function public.consume_landing_mentor_budget(text,text,text)
  to service_role;
