-- Isolated fixtures only; no real points, model calls or answers. All roll back.
begin;
do $$
declare
  u uuid:=gen_random_uuid(); r record; trial uuid; original jsonb;
begin
  insert into public.users(id,email,provider) values(u,'isolated-billing@example.invalid','qa');
  insert into public.user_quotas(user_id,free_resume_daily,paid_resume_remaining,paid_chat_remaining)
    values(u,99,0,11);
  select to_jsonb(q) into original from public.user_quotas q where user_id=u;
  select * into r from public.reserve_user_quota(u,'resume','isolated-full-denied');
  assert not r.allowed and r.source_field='resume_paid_required','old full-resume request bypassed payment';
  select * into r from public.reserve_user_quota(u,'resume_paid','isolated-paid-denied');
  assert not r.allowed,'obsolete daily quota funded a full resume';
  select * into r from public.reserve_resume_experience_trial(u,'isolated-experience-first');
  assert r.allowed and r.source_field='resume_experience_trial','first experience unavailable';
  trial:=r.reservation_id;
  select * into r from public.reserve_resume_experience_trial(u,'isolated-experience-parallel');
  assert not r.allowed,'second workspace claimed the same benefit';
  perform public.finalize_user_quota(trial,true);
  select * into r from public.reserve_resume_experience_trial(u,'isolated-experience-repeat');
  assert not r.allowed,'successful benefit was repeatable';
  assert (select to_jsonb(q)=original from public.user_quotas q where user_id=u),'experience changed existing balances';
  assert not has_function_privilege('anon','public.reserve_resume_experience_trial(uuid,text)','execute');
  assert not has_function_privilege('authenticated','public.reserve_user_quota(uuid,text,text)','execute');
end $$;
rollback;
