-- A bounded first learning round: explanation + one feedback reply, same owned session.
-- Existing one-reply grants count as used; never reset commercial quotas.
alter table public.coach_first_guidance
  add column session_id uuid references public.coach_learning_sessions(id) on delete set null,
  add column completed_replies integer not null default 0 check (completed_replies between 0 and 2),
  add column reserved_request_id uuid;

update public.coach_first_guidance g set completed_replies = 1,
  session_id = (select t.session_id from public.coach_agent_turns t
    where t.user_id = g.user_id and btrim(t.answer) <> '' and t.created_at >= g.created_at
    order by t.created_at limit 1)
where g.status = 'committed';

create function public.reserve_learning_guidance(p_user_id uuid, p_session_id uuid, p_request_id uuid)
returns table(reservation_id uuid, remaining integer, replay boolean)
language plpgsql security invoker set search_path = '' as $$
declare g public.coach_first_guidance%rowtype; new_id uuid;
begin
  if p_session_id is null or p_request_id is null or not exists (
    select 1 from public.coach_learning_sessions s where s.id=p_session_id and s.user_id=p_user_id and s.status='active'
  ) then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 81008));
  select * into g from public.coach_first_guidance where user_id=p_user_id for update;
  if found then
    if g.session_id is distinct from p_session_id then return; end if;
    if g.status='committed' and exists (
      select 1 from public.coach_agent_turns t where t.user_id=p_user_id and t.session_id=p_session_id and t.request_id=p_request_id and btrim(t.answer)<>''
    ) then return query select g.reservation_id, 2-g.completed_replies, true; return; end if;
    if g.status='reserved' or g.completed_replies>=2 then return; end if;
    -- Feedback is allowed only after the first explanation was actually persisted.
    if not exists (select 1 from public.coach_agent_turns t where t.user_id=p_user_id and t.session_id=p_session_id and btrim(t.answer)<>'') then return; end if;
    new_id := gen_random_uuid();
    update public.coach_first_guidance set reservation_id=new_id, status='reserved', reserved_request_id=p_request_id where user_id=p_user_id;
    return query select new_id, 1-g.completed_replies, false;
  else
    if exists (select 1 from public.coach_agent_turns t where t.user_id=p_user_id and btrim(t.answer)<>'') then return; end if;
    new_id := gen_random_uuid();
    insert into public.coach_first_guidance(user_id,reservation_id,session_id,reserved_request_id)
      values(p_user_id,new_id,p_session_id,p_request_id);
    return query select new_id, 1, false;
  end if;
end;
$$;

create function public.finalize_learning_guidance(p_reservation_id uuid,p_success boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare g public.coach_first_guidance%rowtype;
begin
  select * into g from public.coach_first_guidance where reservation_id=p_reservation_id for update;
  if not found then return false; end if;
  if g.status='committed' then return p_success; end if;
  if p_success then
    -- No success accounting until the bound reply is in storage.
    if not exists (select 1 from public.coach_agent_turns t where t.user_id=g.user_id and t.session_id=g.session_id and t.request_id=g.reserved_request_id and btrim(t.answer)<>'') then return false; end if;
    update public.coach_first_guidance set status='committed', completed_replies=completed_replies+1, reserved_request_id=null where user_id=g.user_id;
  elsif g.completed_replies=0 then
    delete from public.coach_first_guidance where user_id=g.user_id;
  else
    update public.coach_first_guidance set status='committed', reserved_request_id=null where user_id=g.user_id;
  end if;
  return true;
end;
$$;
revoke all on function public.reserve_learning_guidance(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.finalize_learning_guidance(uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_learning_guidance(uuid,uuid,uuid) to service_role;
grant execute on function public.finalize_learning_guidance(uuid,boolean) to service_role;
