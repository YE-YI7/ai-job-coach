-- 生成之前原子抢占；所有计费来源共用，不修改历史作答。
create table public.coach_agent_requests (
  user_id uuid not null references public.users(id) on delete cascade,
  request_id uuid not null,
  session_id uuid references public.coach_learning_sessions(id) on delete cascade,
  opportunity_id uuid references public.coach_opportunities(id) on delete cascade,
  input_fingerprint text not null check (length(input_fingerprint)=64),
  claim_token uuid not null,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  result jsonb,
  lease_expires_at timestamptz not null default (now()+interval '3 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.coach_agent_requests enable row level security;
revoke all on public.coach_agent_requests from public,anon,authenticated;
grant select,insert,update,delete on public.coach_agent_requests to service_role;
create index coach_agent_requests_session on public.coach_agent_requests(user_id,session_id,created_at desc);

-- 只检索同账号、同会话的历史；同会话跨岗位仍由主提示词标注为衔接参考。
create function public.search_coach_learning_history(p_user_id uuid,p_session_id uuid,p_terms text[],p_exclude_ids uuid[])
returns table(id uuid,question text,answer text,opportunity_id uuid,created_at timestamptz)
language sql stable security invoker set search_path='' as $$
  select t.id,t.question,t.answer,t.opportunity_id,t.created_at
  from public.coach_agent_turns t
  where t.user_id=p_user_id and t.session_id=p_session_id
    and not(t.id=any(coalesce(p_exclude_ids,'{}'::uuid[])))
    and (exists(select 1 from unnest(p_terms[1:32]) s(term)
         where length(s.term)>=2 and position(lower(s.term) in lower(t.question||' '||t.answer))>0)
         or t.question ~ '纠正|更正|不要|不考虑|限制|只考虑|我的目标')
  order by
    case when t.question ~ '纠正|更正|不要|不考虑|限制|只考虑|我的目标' then 1 else 0 end desc,
    (select count(*) from unnest(p_terms[1:32]) s(term)
       where length(s.term)>=2 and position(lower(s.term) in lower(t.question||' '||t.answer))>0) desc,
    t.created_at desc,t.id desc
  limit 6
$$;
revoke all on function public.search_coach_learning_history(uuid,uuid,text[],uuid[]) from public,anon,authenticated;
grant execute on function public.search_coach_learning_history(uuid,uuid,text[],uuid[]) to service_role;

create function public.search_coach_learning_notes(p_user_id uuid,p_opportunity_id uuid,p_terms text[])
returns table(id uuid,title text,summary text)
language sql stable security invoker set search_path='' as $$
  select s.id,s.title,s.summary from public.coach_learning_sessions s
  where s.user_id=p_user_id and (s.opportunity_id=p_opportunity_id or s.opportunity_id is null)
    and s.summary is not null and btrim(s.summary)<>''
  order by (select count(*) from unnest(p_terms[1:32]) k(term)
    where length(k.term)>=2 and position(lower(k.term) in lower(s.title||' '||s.summary))>0) desc,
    s.created_at desc,s.id desc limit 3
$$;
revoke all on function public.search_coach_learning_notes(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.search_coach_learning_notes(uuid,uuid,text[]) to service_role;
