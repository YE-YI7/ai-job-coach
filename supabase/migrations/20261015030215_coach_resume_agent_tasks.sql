-- 私有改稿任务；与面试作答、聊天流水完全分离。
create table public.coach_resume_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  opportunity_id uuid not null references public.coach_opportunities(id) on delete cascade,
  fingerprint text not null,
  source_revision text not null default '',
  state text not null default 'idle' check (state in ('idle','running','needs_detail','ready','failed','stale')),
  question jsonb,
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  result jsonb,
  error text,
  version integer not null default 1,
  lease_id uuid,
  updated_at timestamptz not null default now(),
  unique(user_id, opportunity_id)
);
alter table public.coach_resume_tasks enable row level security;
revoke all on public.coach_resume_tasks from public, anon, authenticated;
grant select,insert,update,delete on public.coach_resume_tasks to service_role;

-- 任务收尾和可见简历建议同一事务提交；旧任务不能覆盖替换后的简历。
create function public.finish_coach_resume_task(
  p_user_id uuid, p_task_id uuid, p_lease uuid, p_state text,
  p_question jsonb, p_result jsonb, p_error text, p_source text, p_jd text, p_revision text
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare t public.coach_resume_tasks; o public.coach_opportunities;
begin
  if p_state not in ('ready','needs_detail','failed') then raise exception 'invalid resume state'; end if;
  select * into t from public.coach_resume_tasks where id=p_task_id and user_id=p_user_id for update;
  if not found or t.state <> 'running' or t.lease_id is distinct from p_lease then raise exception 'resume lease changed'; end if;
  select * into o from public.coach_opportunities where id=t.opportunity_id and user_id=p_user_id and status='active' for update;
  if not found then raise exception 'resume inaccessible'; end if;
  if btrim(coalesce(o.metadata->>'resumeText','')) <> p_source or btrim(coalesce(o.jd_text,'')) <> p_jd or coalesce(o.metadata->>'resumeRevision','') <> p_revision then
    update public.coach_resume_tasks set state='stale',lease_id=null,error='简历已更新，请按新材料继续',version=version+1,updated_at=now() where id=t.id returning * into t;
    return to_jsonb(t);
  end if;
  if p_state='ready' then
    if jsonb_typeof(p_result->'changes') <> 'array' then raise exception 'invalid resume result'; end if;
    update public.coach_opportunities set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'resumeChanges',p_result->'changes','applicationQuality',p_result->'applicationQuality',
      'resumeGenerationId',p_result->'resumeGenerationId','resumeCheckStale',false
    ),updated_at=now() where id=o.id;
  end if;
  update public.coach_resume_tasks set state=p_state,question=p_question,result=p_result,error=p_error,lease_id=null,version=version+1,updated_at=now()
    where id=t.id returning * into t;
  return to_jsonb(t);
end $$;
revoke all on function public.finish_coach_resume_task(uuid,uuid,uuid,text,jsonb,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_coach_resume_task(uuid,uuid,uuid,text,jsonb,jsonb,text,text,text,text) to service_role;
