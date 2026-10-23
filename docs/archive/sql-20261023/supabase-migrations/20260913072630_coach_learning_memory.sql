-- 持久学习档案不依赖常驻容器；按 owner 与岗位隔离。
create table public.coach_learning_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 opportunity_id uuid references public.coach_opportunities(id) on delete cascade,
 title text not null check(length(title) between 1 and 200),
 status text not null default 'active' check(status in ('active','archived')),
 version integer not null default 1,
 summary text check(length(summary)<=12000),
 created_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(id,user_id)
);
create index coach_learning_owner_scope on public.coach_learning_sessions(user_id,opportunity_id,created_at desc);
alter table public.coach_learning_sessions enable row level security;
revoke all on public.coach_learning_sessions from anon,authenticated;
grant select,insert,update,delete on public.coach_learning_sessions to service_role;
alter table public.coach_agent_turns add column session_id uuid;
alter table public.coach_agent_turns add column learning_trace jsonb not null default '{}'::jsonb;
alter table public.coach_agent_turns add constraint coach_turn_session_owner foreign key(session_id,user_id) references public.coach_learning_sessions(id,user_id) on delete cascade;
create index coach_turn_session_created on public.coach_agent_turns(user_id,session_id,created_at);
-- 与归档的乐观锁共用 session 行锁，防止归档过程中丢失新回复。
create function public.guard_learning_turn() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.session_id is not null then
  update public.coach_learning_sessions set version=version+1
  where id=new.session_id and user_id=new.user_id and status='active'
    and opportunity_id is not distinct from new.opportunity_id;
  if not found then raise exception 'Learning session unavailable or wrong scope'; end if;
 end if;
 return new;
end;
$$;
revoke all on function public.guard_learning_turn() from public,anon,authenticated;
grant execute on function public.guard_learning_turn() to service_role;
create trigger coach_learning_turn_guard before insert on public.coach_agent_turns for each row execute function public.guard_learning_turn();
create table public.coach_memory_documents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 path text not null check(path='profile/overview.md'),
 content text not null check(length(content)<=12000),
 source_fingerprint text not null,
 created_at timestamptz not null default now(),
 unique(user_id,path,source_fingerprint)
);
alter table public.coach_memory_documents enable row level security;
revoke all on public.coach_memory_documents from anon,authenticated;
grant select,insert,delete on public.coach_memory_documents to service_role;
