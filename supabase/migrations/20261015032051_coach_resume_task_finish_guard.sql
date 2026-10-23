create index coach_resume_tasks_opportunity_idx on public.coach_resume_tasks(opportunity_id);

-- Finalization also compares the decisions read just before merging a rerun.
-- A simultaneous accept/reject must win over a delayed model result.
create or replace function public.finish_coach_resume_task(
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
  if btrim(coalesce(o.metadata->>'resumeText','')) <> p_source or btrim(coalesce(o.jd_text,'')) <> p_jd or coalesce(o.metadata->>'resumeRevision','') <> p_revision
    or (p_state='ready' and coalesce(o.metadata->'resumeChanges','[]'::jsonb) is distinct from coalesce(p_result->'previousChanges','[]'::jsonb)) then
    update public.coach_resume_tasks set state='stale',lease_id=null,error='简历或修改决定已更新，请按当前材料继续',version=version+1,updated_at=now() where id=t.id returning * into t;
    return to_jsonb(t);
  end if;
  if p_state='ready' then
    if jsonb_typeof(p_result->'changes') <> 'array' then raise exception 'invalid resume result'; end if;
    p_result := p_result - 'previousChanges';
    update public.coach_opportunities set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'resumeChanges',p_result->'changes','applicationQuality',p_result->'applicationQuality',
      'resumeGenerationId',p_result->'resumeGenerationId','resumeCheckStale',coalesce((p_result->>'resumeCheckStale')::boolean,false)
    ),updated_at=now() where id=o.id;
  end if;
  update public.coach_resume_tasks set state=p_state,question=p_question,result=p_result,error=p_error,lease_id=null,version=version+1,updated_at=now()
    where id=t.id returning * into t;
  return to_jsonb(t);
end $$;
revoke all on function public.finish_coach_resume_task(uuid,uuid,uuid,text,jsonb,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_coach_resume_task(uuid,uuid,uuid,text,jsonb,jsonb,text,text,text,text) to service_role;
