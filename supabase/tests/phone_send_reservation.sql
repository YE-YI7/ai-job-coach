-- Synthetic database admission only; never sends SMS. Every change rolls back.
begin;
do $$
declare result jsonb; n text:=repeat('d',63)||'1'; g text:=repeat('d',63)||'2'; b text:=repeat('d',63)||'3';
  first_id uuid:='80d9d087-7918-4194-8820-144e862bfa01';
  second_id uuid:='80d9d087-7918-4194-8820-144e862bfa02'; c integer;
begin
  assert not has_function_privilege('anon','public.reserve_phone_auth_send(uuid,text,text,uuid,text,text,text,boolean)','execute');
  assert not has_function_privilege('authenticated','public.reserve_phone_auth_send(uuid,text,text,uuid,text,text,text,boolean)','execute');
  assert has_function_privilege('service_role','public.reserve_phone_auth_send(uuid,text,text,uuid,text,text,text,boolean)','execute');
  assert not exists(select 1 from public.phone_auth_challenges where phone='+8613900009801');
  assert not exists(select 1 from public.public_action_rate_limits where key_hash in(n,g));
  result:=public.reserve_phone_auth_send(first_id,'+8613900009801','login',null,b,n,g,false);
  assert result->>'status'='ready';
  result:=public.reserve_phone_auth_send(second_id,'+8613900009801','login',null,b,n,g,false);
  assert result->>'status'='cooldown';
  select request_count into c from public.public_action_rate_limits where scope='phone-send-number' and key_hash=n;
  assert c=1,'cooldown burned a number allowance';
  select request_count into c from public.public_action_rate_limits where scope='phone-send-global' and key_hash=g;
  assert c=1,'cooldown burned a site allowance';
  update public.phone_auth_challenges set created_at=now()-interval '61 seconds',state='sent' where id=first_id;
  update public.public_action_rate_limits set request_count=5 where scope='phone-send-number' and key_hash=n;
  result:=public.reserve_phone_auth_send(second_id,'+8613900009801','login',null,b,n,g,false);
  assert result->>'status'='limited' and result->>'limit_scope'='number';
  assert (result->>'retry_after_seconds')::integer between 1 and 86400;
  assert not exists(select 1 from public.phone_auth_challenges where id=second_id);
  assert exists(select 1 from public.phone_auth_challenges where id=first_id and state='sent'),'denial invalidated an existing OTP';
  select request_count into c from public.public_action_rate_limits where scope='phone-send-number' and key_hash=n;
  assert c=5,'denied request kept incrementing the daily counter';
  update public.public_action_rate_limits set request_count=1 where scope='phone-send-number' and key_hash=n;
  update public.public_action_rate_limits set request_count=100 where scope='phone-send-global' and key_hash=g;
  result:=public.reserve_phone_auth_send(second_id,'+8613900009801','login',null,b,n,g,false);
  assert result->>'status'='limited' and result->>'limit_scope'='global';
  select request_count into c from public.public_action_rate_limits where scope='phone-send-number' and key_hash=n;
  assert c=1,'global denial did not roll back number reservation';
  assert exists(select 1 from public.phone_auth_challenges where id=first_id and state='sent');
end;
$$;
rollback;
