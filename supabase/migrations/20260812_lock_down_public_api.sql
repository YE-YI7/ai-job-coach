-- The application uses a server-only service-role client and custom signed sessions.
-- Public Supabase roles must not access business data directly.

alter table public.watcha_tokens enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

revoke execute on function public.check_boss_defeated() from public, anon, authenticated;
revoke execute on function public.check_level_up() from public, anon, authenticated;
revoke execute on function public.cleanup_expired_raw_content() from public, anon, authenticated;
revoke execute on function public.create_user_related_data() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.on_task_completed() from public, anon, authenticated;
revoke execute on function public.update_streak_on_checkin() from public, anon, authenticated;

alter function public.check_boss_defeated() set search_path = public, pg_temp;
alter function public.check_level_up() set search_path = public, pg_temp;
alter function public.cleanup_expired_raw_content() set search_path = public, pg_temp;
alter function public.create_user_related_data() set search_path = public, pg_temp;
alter function public.handle_new_auth_user() set search_path = public, pg_temp;
alter function public.on_task_completed() set search_path = public, pg_temp;
alter function public.update_streak_on_checkin() set search_path = public, pg_temp;

alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
