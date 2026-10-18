-- Synthetic provider PASS only; this does not replace real SMS acceptance.
begin;
do $$
declare s uuid:=gen_random_uuid(); t uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); a uuid:=gen_random_uuid();
  h text:=repeat('d',64); p text:='+8613500000099'; r jsonb; before_target jsonb; before_quota jsonb;
begin
  if exists(select 1 from public.users where phone=p) then raise exception 'Synthetic number in use; no changes'; end if;
  insert into public.users(id,provider,phone) values(s,'phone',p);
  insert into public.users(id,provider,email) values(t,'invite','recovery-qa-'||t||'@example.invalid');
  insert into public.user_quotas(user_id,paid_resume_remaining) values(s,0),(t,7);
  select to_jsonb(u) into before_target from public.users u where id=t;
  select to_jsonb(q) into before_quota from public.user_quotas q where user_id=t;
  assert (public.begin_phone_recovery(c,p,'login',null,h)->>'status')='invalid';
  assert (public.begin_phone_recovery(c,p,'bind',s,h)->>'status')='original_account_required';
  r:=public.begin_phone_recovery(c,p,'bind',t,h);assert r->>'status'='ready';
  update public.phone_auth_challenges set state='sent' where id=c;
  assert (public.claim_phone_auth(c,'bind',t,repeat('e',64),a)->>'status')='invalid';
  assert (public.claim_phone_auth(c,'bind',t,h,a)->>'status')='ready';
  assert (public.claim_phone_auth(c,'bind',t,h,gen_random_uuid())->>'status')='busy';
  update public.phone_auth_challenges set allow_recovery=false where id=c;
  assert (public.finish_phone_recovery(c,'bind',t,h,a,'pass')->>'status')='expired';
  update public.phone_auth_challenges set allow_recovery=true where id=c;
  assert (public.finish_phone_recovery(c,'bind',t,h,gen_random_uuid(),'pass')->>'status')='expired';
  assert (public.finish_phone_recovery(c,'bind',t,h,a,'fail')->>'status')='incorrect';
  perform public.claim_phone_auth(c,'bind',t,h,a);
  update public.user_quotas set paid_resume_remaining=1 where user_id=s;
  assert (public.finish_phone_recovery(c,'bind',t,h,a,'pass')->>'status')='account_has_data';
  assert (select phone=p from public.users where id=s) and (select phone is null from public.users where id=t);
  update public.user_quotas set paid_resume_remaining=0 where user_id=s;
  insert into public.coach_opportunities(id,user_id,company,role,status) values(gen_random_uuid(),s,'Synthetic','Synthetic','active');
  assert (public.finish_phone_recovery(c,'bind',t,h,a,'pass')->>'status')='account_has_data';
  delete from public.coach_opportunities where user_id=s;
  -- Execute the real finisher as its production role, not elevated postgres.
  execute 'set local role service_role';
  r:=public.finish_phone_recovery(c,'bind',t,h,a,'pass');
  execute 'reset role';
  assert r->>'status'='ok' and (r->>'user_id')::uuid=t and (r->>'recovered')::boolean;
  assert (select phone is null from public.users where id=s);
  assert (select to_jsonb(u)-'phone'=before_target-'phone' and phone=p from public.users u where id=t);
  assert (select to_jsonb(q)=before_quota from public.user_quotas q where user_id=t);
  assert exists(select 1 from public.phone_account_recoveries where challenge_id=c and source_user_id=s and target_user_id=t);
  assert (public.finish_phone_recovery(c,'bind',t,h,a,'pass')->>'status')='expired';
  assert not has_function_privilege('anon','public.finish_phone_recovery(uuid,text,uuid,text,uuid,text)','EXECUTE');
  assert not has_function_privilege('authenticated','public.begin_phone_recovery(uuid,text,text,uuid,text)','EXECUTE');
  assert not has_table_privilege('authenticated','public.phone_account_recoveries','SELECT');
end;
$$;
rollback;
select 'recovery checks passed; synthetic fixtures rolled back' as result;
