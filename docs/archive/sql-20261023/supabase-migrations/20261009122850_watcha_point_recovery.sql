-- Bound AI calls finish within minutes. Recover abandoned reservations after one hour.
create function public.recover_watcha_points(p_user_id text,p_environment text) returns integer language plpgsql security invoker set search_path=public as $$
declare n integer;
begin
 perform 1 from watcha_point_wallets where user_id=p_user_id and environment=p_environment for update;
 with expired as (
  update watcha_point_reservations set status='refunded',finished_at=now()
  where user_id=p_user_id and environment=p_environment and status='reserved' and created_at<now()-interval '1 hour' returning id
 ) select count(*) into n from expired;
 if n>0 then update watcha_point_wallets set balance=balance+n where user_id=p_user_id and environment=p_environment; end if;
 return n;
end $$;
revoke all on function public.recover_watcha_points(text,text) from public,anon,authenticated;
grant execute on function public.recover_watcha_points(text,text) to service_role;
