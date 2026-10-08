-- Run as a single request. Synthetic data never commits; failures raise an error.
begin;
do $test$
declare
 u uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); t uuid:=gen_random_uuid();
 run_a uuid:=gen_random_uuid(); run_b uuid:=gen_random_uuid(); req uuid:=gen_random_uuid();
 note jsonb; updated jsonb; decision jsonb; v jsonb; key text; old_id uuid; failed boolean;
begin
 insert into public.users(id,nickname) values(u,'rollback acceptance'),(other_user,'rollback owner isolation');
 insert into public.coach_agent_turns(id,user_id,request_id,question,answer,context_fingerprint,learning_trace)
 values(t,u,gen_random_uuid(),'我的答案：分母是标注集中全部相关材料','本题标准已覆盖','test',jsonb_build_object('outcome',jsonb_build_object(
  'goal','解释召回率','criterionVersion',1,'attemptTurnIds',jsonb_build_array(t),'answerDraft','原始稿',
  'observedStatus','提示下完成','evidenceRefs',jsonb_build_array('turn:'||t),'openIssue',null,'nextStep',null,'revision',1,'status','draft')));
 note:=public.save_coach_outcome(u,t,'修改后的答案',0,req);
 if note->>'id' is null or note->'outcome'->>'answerDraft'<>'修改后的答案' then raise exception 'outcome save failed'; end if;
 updated:=public.save_coach_outcome(u,t,'修改后的答案',0,req);
 if note->>'id'<>updated->>'id' or updated->>'version'<>'1' then raise exception 'idempotency failed'; end if;
 updated:=public.save_coach_outcome(u,t,'第二次编辑',1,gen_random_uuid());
 if updated->>'id'<>note->>'id' or updated->>'version'<>'2' then raise exception 'outcome revision failed'; end if;
 failed:=false;
 begin perform public.save_coach_outcome(u,t,'过期标签的稿',1,gen_random_uuid()); exception when others then
  if sqlerrm<>'outcome_version_conflict' then raise; end if; failed:=true; end;
 if not failed then raise exception 'stale outcome overwritten'; end if;
 failed:=false;
 begin perform public.save_coach_outcome(other_user,t,'冒充他人',0,gen_random_uuid()); exception when others then
  if sqlerrm<>'source_not_found' then raise; end if; failed:=true; end;
 if not failed then raise exception 'owner isolation failed'; end if;
 if (select outcome->>'answerDraft' from public.coach_learning_sessions where id=(note->>'id')::uuid)<>'第二次编辑' then raise exception 'refresh reads stale draft'; end if;

 v:=jsonb_build_object('jobId','j1','url','https://example.com/jobs/1','company','示例','title','产品实习','location','北京',
   'decision','verify','reason',null,'batchRunId',run_a,'materialsVersion',repeat('a',64));
 insert into public.coach_runs(id,user_id,action_type,executor,status,goal,input,context_snapshot,output)
 values(run_a,u,'job_decision','hosted_api','completed','测试找岗','{"billingUnit":"job_search"}','{}',
  jsonb_build_object('profileFingerprint',repeat('a',64),'jobs',jsonb_build_array(jsonb_build_object('id','j1','url','https://example.com/jobs/1','company','示例','title','产品实习')))),
 (run_b,u,'job_decision','hosted_api','completed','另一批','{"billingUnit":"job_search"}','{}',
  jsonb_build_object('profileFingerprint',repeat('a',64),'jobs',jsonb_build_array(jsonb_build_object('id','j1','url','https://example.com/jobs/1','company','示例','title','产品实习'))));
 key:='job_decision:'||run_a||':https://example.com/jobs/1';
 req:=gen_random_uuid();
 decision:=public.save_coach_job_decision(u,key,v,'先核实',req,null);
 old_id:=(decision->>'id')::uuid;
 if public.save_coach_job_decision(u,key,v,'先核实',req,null)->>'id'<>old_id::text then raise exception 'decision replay duplicated'; end if;
 failed:=false;
 begin perform public.save_coach_job_decision(u,key,v||'{"decision":"advance"}',null,gen_random_uuid(),old_id);
 exception when not_null_violation then failed:=true; end;
 if not failed or (select status from public.coach_claims where id=old_id)<>'confirmed' then raise exception 'failed insert withdrew old decision'; end if;
 failed:=false;
 begin perform public.save_coach_job_decision(u,key,v||'{"jobId":"forged"}','先推进',gen_random_uuid(),old_id);
 exception when others then if sqlerrm<>'job_not_in_batch' then raise; end if; failed:=true; end;
 if not failed then raise exception 'forged membership accepted'; end if;
 failed:=false;
 begin perform public.save_coach_job_decision(other_user,key,v,'先推进',gen_random_uuid(),null);
 exception when others then if sqlerrm<>'batch_not_found' then raise; end if; failed:=true; end;
 if not failed then raise exception 'foreign batch accepted'; end if;
 decision:=public.save_coach_job_decision(u,key,v||'{"decision":"advance"}','先推进',gen_random_uuid(),old_id);
 if (select status from public.coach_claims where id=old_id)<>'withdrawn' then raise exception 'supersede failed'; end if;
 failed:=false;
 begin perform public.save_coach_job_decision(u,key,v,'先核实',gen_random_uuid(),old_id);
 exception when others then if sqlerrm<>'decision_version_conflict' then raise; end if; failed:=true; end;
 if not failed then raise exception 'stale decision overwrote new'; end if;
 perform public.save_coach_job_decision(u,'job_decision:'||run_b||':https://example.com/jobs/1',v||jsonb_build_object('batchRunId',run_b),'另一批先核实',gen_random_uuid(),null);
 if (select count(*) from public.coach_claims where user_id=u and claim_type='job_decision' and status='confirmed')<>2 then raise exception 'batch decisions collapsed'; end if;
 if has_function_privilege('anon','public.save_coach_outcome(uuid,uuid,text,integer,uuid)','execute')
  or has_function_privilege('authenticated','public.save_coach_job_decision(uuid,text,jsonb,text,uuid,uuid)','execute')
  then raise exception 'browser role may impersonate owner'; end if;
 delete from public.coach_agent_turns where id=t and user_id=u;
 if exists(select 1 from public.coach_learning_sessions where source_turn_id=t) then raise exception 'deleted source retained derived note'; end if;
end
$test$;
rollback;
