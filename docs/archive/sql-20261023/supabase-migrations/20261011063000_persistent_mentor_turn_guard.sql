-- A conversation belongs to its owner; each turn retains its own job source.
-- Keep the session row lock/version check used by archive optimistic locking.
create or replace function public.guard_learning_turn() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if new.opportunity_id is not null and not exists (
   select 1 from public.coach_opportunities
   where id=new.opportunity_id and user_id=new.user_id
 ) then
   raise exception 'Learning turn opportunity unavailable or wrong owner';
 end if;
 if new.session_id is not null then
   update public.coach_learning_sessions set version=version+1
   where id=new.session_id and user_id=new.user_id and status='active';
   if not found then raise exception 'Learning session unavailable or wrong owner'; end if;
 end if;
 return new;
end;
$$;
revoke all on function public.guard_learning_turn() from public,anon,authenticated;
grant execute on function public.guard_learning_turn() to service_role;
