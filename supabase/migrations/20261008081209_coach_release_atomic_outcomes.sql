-- Additive migration: existing conversations and manual notes are unchanged.
alter table public.coach_learning_sessions
  add column source_turn_id uuid references public.coach_agent_turns(id) on delete cascade,
  add column outcome jsonb,
  add column last_request_id uuid;
create unique index coach_outcome_source_owner
  on public.coach_learning_sessions(user_id, source_turn_id) where source_turn_id is not null;
create index coach_outcome_source_fk on public.coach_learning_sessions(source_turn_id)
  where source_turn_id is not null;

-- A transaction lock serializes initial saves as well as subsequent revisions.
-- Invoker + service-role-only execution: browser clients cannot choose an owner.
create function public.save_coach_outcome(
  p_user_id uuid, p_turn_id uuid, p_answer text, p_expected_version integer, p_request_id uuid
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare t public.coach_agent_turns; s public.coach_learning_sessions; o jsonb; body text;
begin
  if p_request_id is null or p_expected_version < 0 or p_expected_version is null
    or p_answer is null or length(trim(p_answer)) not between 1 and 6000 then raise exception 'invalid_outcome'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':outcome:' || p_turn_id::text, 0));
  select * into t from public.coach_agent_turns where id=p_turn_id and user_id=p_user_id for share;
  if not found then raise exception 'source_not_found'; end if;
  o := t.learning_trace->'outcome';
  if o is null or jsonb_typeof(o) <> 'object' or coalesce(o->>'answerDraft','')='' then
    raise exception 'source_has_no_outcome'; end if;
  select * into s from public.coach_learning_sessions where user_id=p_user_id and source_turn_id=p_turn_id for update;
  if found then
    if s.last_request_id=p_request_id then
      if s.outcome->>'answerDraft' <> trim(p_answer) then raise exception 'request_reused'; end if;
      return to_jsonb(s);
    end if;
    if s.version <> p_expected_version then raise exception 'outcome_version_conflict'; end if;
    o := s.outcome || jsonb_build_object('answerDraft',trim(p_answer),'status','saved','revision',s.version+1);
  else
    if p_expected_version <> 0 then raise exception 'outcome_version_conflict'; end if;
    o := o || jsonb_build_object('answerDraft',trim(p_answer),'status','saved','revision',1);
  end if;
  body := '本次目标：' || (o->>'goal') || E'\n\n我的答案：\n' || (o->>'answerDraft')
    || E'\n\n本题表现：' || (o->>'observedStatus') || '（只看这一题，不是永久能力认证）'
    || case when coalesce(o->>'openIssue','')<>'' then E'\n还没解决：' || (o->>'openIssue') else '' end
    || case when coalesce(o->>'nextStep','')<>'' then E'\n下一步：' || (o->>'nextStep') else '' end;
  if s.id is null then
    insert into public.coach_learning_sessions(user_id,opportunity_id,title,status,summary,archived_at,source_turn_id,outcome,last_request_id)
      values(p_user_id,t.opportunity_id,left(o->>'goal',200),'archived',body,now(),p_turn_id,o,p_request_id) returning * into s;
  else
    update public.coach_learning_sessions set summary=body,outcome=o,version=version+1,last_request_id=p_request_id
      where id=s.id and user_id=p_user_id returning * into s;
  end if;
  return to_jsonb(s);
end $$;
revoke all on function public.save_coach_outcome(uuid,uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.save_coach_outcome(uuid,uuid,text,integer,uuid) to service_role;

create function public.save_coach_job_decision(
  p_user_id uuid, p_entity_key text, p_value jsonb, p_display_text text,
  p_request_id uuid, p_expected_claim_id uuid
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare r public.coach_runs; old public.coach_claims; saved public.coach_claims; j jsonb;
begin
  if p_request_id is null or coalesce(p_value->>'decision','') not in ('advance','not_now','verify') then
    raise exception 'invalid_decision'; end if;
  select * into r from public.coach_runs where id=(p_value->>'batchRunId')::uuid and user_id=p_user_id for share;
  if not found or r.action_type <> 'job_decision' or r.input->>'billingUnit' <> 'job_search'
    or r.output->>'profileFingerprint' is distinct from p_value->>'materialsVersion' then raise exception 'batch_not_found'; end if;
  select item into j from jsonb_array_elements(coalesce(r.output->'jobs','[]')) item
    where item->>'id'=p_value->>'jobId' and item->>'url'=p_value->>'url' limit 1;
  if j is null or j->>'company' is distinct from p_value->>'company' or j->>'title' is distinct from p_value->>'title'
    or j->'review'->>'eligibility'='conflict' then raise exception 'job_not_in_batch'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_entity_key,0));
  select * into saved from public.coach_claims where user_id=p_user_id and entity_key=p_entity_key
    and claim_type='job_decision' and value->>'requestId'=p_request_id::text order by created_at desc limit 1;
  if found then
    if saved.status='withdrawn' then raise exception 'decision_version_conflict'; end if;
    if saved.value - 'requestId' is distinct from p_value then raise exception 'request_reused'; end if;
    return to_jsonb(saved);
  end if;
  select * into old from public.coach_claims where user_id=p_user_id and entity_key=p_entity_key
    and claim_type='job_decision' and status <> 'withdrawn' order by updated_at desc limit 1 for update;
  if old.id is distinct from p_expected_claim_id then raise exception 'decision_version_conflict'; end if;
  -- Any insert failure rolls back the withdrawal in this same transaction.
  update public.coach_claims set status='withdrawn',updated_at=now(),migrated_from='withdrawn:superseded'
    where user_id=p_user_id and entity_key=p_entity_key and claim_type='job_decision' and status <> 'withdrawn';
  insert into public.coach_claims(user_id,entity_type,entity_key,claim_type,value,display_text,source_excerpt,
    status,visibility,source_kind,verification_level,supersedes_id,confirmed_at)
    values(p_user_id,'preference',p_entity_key,'job_decision',p_value || jsonb_build_object('requestId',p_request_id),
      p_display_text,p_value->>'reason','confirmed','private','user_statement','user_confirmed',old.id,now()) returning * into saved;
  return to_jsonb(saved);
end $$;
revoke all on function public.save_coach_job_decision(uuid,text,jsonb,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_coach_job_decision(uuid,text,jsonb,text,uuid,uuid) to service_role;
