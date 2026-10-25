-- Fresh isolated database only. All fixtures roll back; no model or account use.
begin;
do $$
declare
  result record;
  before_rows jsonb;
  global_hash text:=repeat('b',64);
  first_ip text:=repeat('a',64);
  bucket timestamptz;
begin
  assert not (select prosecdef from pg_proc where oid='public.consume_landing_mentor_budget(text,text,text)'::regprocedure);
  assert not has_function_privilege('anon','public.consume_landing_mentor_budget(text,text,text)','execute');
  assert not has_function_privilege('authenticated','public.consume_landing_mentor_budget(text,text,text)','execute');
  assert has_function_privilege('service_role','public.consume_landing_mentor_budget(text,text,text)','execute');

  select * into result from public.consume_landing_mentor_budget(first_ip,global_hash,repeat('c',64));
  assert result.allowed,'first preview denied';
  select jsonb_agg(to_jsonb(r) order by scope,key_hash,window_started_at) into before_rows
    from public.public_action_rate_limits r;
  select * into result from public.consume_landing_mentor_budget(first_ip,global_hash,repeat('c',64));
  assert not result.allowed,'duplicate intent allowed';
  assert (select jsonb_agg(to_jsonb(r) order by scope,key_hash,window_started_at)=before_rows
    from public.public_action_rate_limits r),'duplicate consumed any counter';
  select * into result from public.consume_landing_mentor_budget(repeat('d',64),global_hash,repeat('c',64));
  assert not result.allowed,'intent repeated after changing IP';
  assert (select jsonb_agg(to_jsonb(r) order by scope,key_hash,window_started_at)=before_rows
    from public.public_action_rate_limits r),'cross-IP duplicate consumed any counter';

  perform public.consume_landing_mentor_budget(first_ip,global_hash,repeat('e',64));
  perform public.consume_landing_mentor_budget(first_ip,global_hash,repeat('f',64));
  select jsonb_agg(to_jsonb(r) order by scope,key_hash,window_started_at) into before_rows
    from public.public_action_rate_limits r;
  select * into result from public.consume_landing_mentor_budget(first_ip,global_hash,repeat('1',64));
  assert not result.allowed,'fourth IP request allowed';
  assert (select jsonb_agg(to_jsonb(r) order by scope,key_hash,window_started_at)=before_rows
    from public.public_action_rate_limits r),'IP denial consumed any counter';

  update public.public_action_rate_limits set request_count=20
    where scope='landing-mentor-global' and key_hash=global_hash;
  select jsonb_agg(to_jsonb(r) order by scope,key_hash,window_started_at) into before_rows
    from public.public_action_rate_limits r;
  select * into result from public.consume_landing_mentor_budget(repeat('2',64),global_hash,repeat('3',64));
  assert not result.allowed,'global budget exceeded';
  assert (select jsonb_agg(to_jsonb(r) order by scope,key_hash,window_started_at)=before_rows
    from public.public_action_rate_limits r),'global denial consumed IP or intent';

  -- A lower-level failure must roll back preceding counters and propagate.
  -- Supplying NULL is rejected before any update.
  begin
    perform public.consume_landing_mentor_budget(repeat('4',64),global_hash,null);
    raise exception 'invalid identity unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm<>'invalid landing budget identity' then raise; end if;
  end;
  assert (select jsonb_agg(to_jsonb(r) order by scope,key_hash,window_started_at)=before_rows
    from public.public_action_rate_limits r),'invalid call consumed budget';

  -- Fresh day uses a fresh bucket; successful requests stay capped, not unmetered.
  bucket:=to_timestamp(floor(extract(epoch from clock_timestamp())/86400)*86400);
  update public.public_action_rate_limits set window_started_at=bucket-interval '1 day';
  select * into result from public.consume_landing_mentor_budget(first_ip,global_hash,repeat('c',64));
  assert result.allowed,'daily window failed to reset';
  assert (select request_count=1 from public.public_action_rate_limits
    where scope='landing-mentor-ip' and key_hash=first_ip and window_started_at=bucket);
end $$;
rollback;
