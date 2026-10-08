-- One protected first mentor reply, never usable by import/discovery routes.
create table public.coach_first_guidance (
  user_id uuid primary key references public.users(id) on delete cascade,
  reservation_id uuid not null unique default gen_random_uuid(),
  status text not null default 'reserved' check (status in ('reserved', 'committed')),
  created_at timestamptz not null default now()
);
alter table public.coach_first_guidance enable row level security;
revoke all on public.coach_first_guidance from public, anon, authenticated;
grant select, insert, update, delete on public.coach_first_guidance to service_role;

create function public.reserve_first_guidance(p_user_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare result uuid;
begin
  if exists (select 1 from public.coach_agent_turns where user_id = p_user_id and btrim(answer) <> '') then
    return null;
  end if;
  insert into public.coach_first_guidance(user_id) values (p_user_id)
    on conflict (user_id) do nothing returning reservation_id into result;
  return result;
end;
$$;

create function public.finalize_first_guidance(p_reservation_id uuid, p_success boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_success then
    update public.coach_first_guidance set status = 'committed'
      where reservation_id = p_reservation_id and status = 'reserved';
  else
    delete from public.coach_first_guidance
      where reservation_id = p_reservation_id and status = 'reserved';
  end if;
  return found;
end;
$$;
revoke all on function public.reserve_first_guidance(uuid) from public, anon, authenticated;
revoke all on function public.finalize_first_guidance(uuid, boolean) from public, anon, authenticated;
grant execute on function public.reserve_first_guidance(uuid) to service_role;
grant execute on function public.finalize_first_guidance(uuid, boolean) to service_role;
