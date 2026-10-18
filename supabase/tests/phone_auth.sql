-- Run against an actual database, never substitutes for real-provider/browser acceptance.
-- All fixtures and simulated provider outcomes are rolled back, including generated users.
begin;
do $$
declare
  c uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid();
  attempt uuid := gen_random_uuid(); account_a uuid; account_b uuid := gen_random_uuid();
  h text := repeat('a',64); other_h text := repeat('b',64); result jsonb; original_user jsonb; original_quota jsonb;
  phone_a text := '+8613800138000'; phone_b text := '+8613900139000';
begin
  if exists(select 1 from public.users where phone in (phone_a,phone_b)) then
    raise exception 'Fixture numbers are already in use; do not alter them';
  end if;
  result := public.begin_phone_auth(c,phone_a,'login',null,h);
  assert result->>'status' = 'ready', 'begin login';
  result := public.begin_phone_auth(gen_random_uuid(),phone_a,'login',null,h);
  assert result->>'status' = 'cooldown', 'global phone cooldown';
  update public.phone_auth_challenges set state='sent' where id=c;
  result := public.claim_phone_auth(c,'login',null,other_h,attempt);
  assert result->>'status' = 'invalid', 'browser binding';
  result := public.claim_phone_auth(c,'bind',account_b,h,attempt);
  assert result->>'status' = 'invalid', 'purpose and account binding';
  result := public.claim_phone_auth(c,'login',null,h,attempt);
  assert result->>'status' = 'ready', 'first verification claim';
  result := public.claim_phone_auth(c,'login',null,h,gen_random_uuid());
  assert result->>'status' = 'busy', 'no concurrent verifier';
  result := public.finish_phone_auth(c,'login',null,h,gen_random_uuid(),'pass');
  assert result->>'status' = 'expired', 'wrong lease cannot finish';
  result := public.finish_phone_auth(c,'login',null,h,attempt,'fail');
  assert result->>'status' = 'incorrect', 'wrong OTP releases lease';
  result := public.claim_phone_auth(c,'login',null,h,attempt);
  assert result->>'status' = 'ready', 'retry claim';
  result := public.finish_phone_auth(c,'login',null,h,attempt,'pass');
  assert result->>'status' = 'ok' and (result->>'is_new_user')::boolean, 'creates a phone-only account';
  account_a := (result->>'user_id')::uuid;
  assert (select email is null and phone=phone_a and provider='phone' from public.users where id=account_a), 'no fake email';
  assert (select free_chat_daily=3 and paid_chat_remaining=0 from public.user_quotas where user_id=account_a), 'default quotas only for new user';
  result := public.claim_phone_auth(c,'login',null,h,attempt);
  assert result->>'status' = 'expired', 'single-use proof';

  -- Login again must reuse identity and must not reset paid/free quotas.
  update public.user_quotas set paid_chat_remaining=7,free_chat_daily=1 where user_id=account_a;
  select to_jsonb(q) into original_quota from public.user_quotas q where user_id=account_a;
  update public.phone_auth_challenges set created_at=now()-interval '61 seconds' where id=c;
  result := public.begin_phone_auth(c2,phone_a,'login',null,h);
  assert result->>'status'='ready', 'resend after cooldown';
  update public.phone_auth_challenges set state='sent' where id=c2;
  perform public.claim_phone_auth(c2,'login',null,h,attempt);
  result := public.finish_phone_auth(c2,'login',null,h,attempt,'pass');
  assert (result->>'user_id')::uuid=account_a and not (result->>'is_new_user')::boolean, 'same login identity';
  assert (select to_jsonb(q)=original_quota from public.user_quotas q where user_id=account_a), 'quota preservation';

  insert into public.users(id,email,provider,nickname) values(account_b,'phone-qa-'||account_b||'@example.invalid','qa','QA binding');
  insert into public.user_quotas(user_id,paid_chat_remaining) values(account_b,11);
  select to_jsonb(u) into original_user from public.users u where id=account_b;
  select to_jsonb(q) into original_quota from public.user_quotas q where user_id=account_b;
  update public.phone_auth_challenges set created_at=now()-interval '61 seconds' where id in(c,c2);
  perform public.begin_phone_auth(c3,phone_a,'bind',account_b,h);
  update public.phone_auth_challenges set state='sent' where id=c3;
  perform public.claim_phone_auth(c3,'bind',account_b,h,attempt);
  result := public.finish_phone_auth(c3,'bind',account_b,h,attempt,'pass');
  assert result->>'status'='conflict', 'never merge or steal a phone';
  assert (select to_jsonb(u)=original_user from public.users u where id=account_b), 'conflict leaves user intact';

  c3 := gen_random_uuid();
  result := public.begin_phone_auth(c3,phone_b,'bind',account_b,h);
  assert result->>'status'='ready', 'start binding';
  update public.phone_auth_challenges set state='sent' where id=c3;
  perform public.claim_phone_auth(c3,'bind',account_b,h,attempt);
  result := public.finish_phone_auth(c3,'bind',account_b,h,attempt,'pass');
  assert result->>'status'='ok' and (result->>'user_id')::uuid=account_b, 'same original account';
  assert (select to_jsonb(u)-'phone'=original_user-'phone' and phone=phone_b from public.users u where id=account_b), 'only phone changes';
  assert (select to_jsonb(q)=original_quota from public.user_quotas q where user_id=account_b), 'binding never resets quota';
  result := public.begin_phone_auth(gen_random_uuid(),phone_a,'bind',account_b,h);
  assert result->>'status'='already_bound', 'changing bound phone needs separate step-up flow';

  update public.phone_auth_challenges set state='sent',attempts=5 where id=c;
  result := public.claim_phone_auth(c,'login',null,h,attempt);
  assert result->>'status'='expired', 'attempt limit';
  update public.phone_auth_challenges set attempts=0,expires_at=now()-interval '1 second' where id=c;
  result := public.claim_phone_auth(c,'login',null,h,attempt);
  assert result->>'status'='expired', 'expiration';

  assert not has_table_privilege('anon','public.phone_auth_challenges','SELECT'), 'anon denied';
  assert not has_table_privilege('authenticated','public.phone_auth_challenges','SELECT'), 'browser JWT denied';
  assert not has_function_privilege('anon','public.finish_phone_auth(uuid,text,uuid,text,uuid,text)','EXECUTE'), 'anon RPC denied';
  assert not has_function_privilege('authenticated','public.finish_phone_auth(uuid,text,uuid,text,uuid,text)','EXECUTE'), 'browser RPC denied';
end;
$$;
rollback;
select 'phone-auth SQL assertions passed; all fixtures rolled back' as result;
