-- A repeated idempotency key must never authorize another model call.

create or replace function public.reserve_user_quota(
  p_user_id uuid,
  p_quota_type text,
  p_idempotency_key text
)
returns table(reservation_id uuid, allowed boolean, source_field text, remaining integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  q public.user_quotas%rowtype;
  existing public.quota_usage_ledger%rowtype;
  selected_field text;
  selected_remaining integer;
  new_id uuid;
begin
  if p_quota_type not in ('chat', 'resume', 'interview') or length(trim(p_idempotency_key)) < 8 then
    raise exception 'invalid quota reservation input';
  end if;

  select * into existing from public.quota_usage_ledger
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    return query select existing.id, false, existing.source_field, null::integer;
    return;
  end if;

  insert into public.user_quotas(user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;

  select * into q from public.user_quotas where user_id = p_user_id for update;
  if q.last_free_reset < current_date then
    update public.user_quotas set
      free_chat_daily = 3,
      free_resume_daily = 1,
      last_free_reset = current_date,
      updated_at = now()
    where user_id = p_user_id
    returning * into q;
  end if;

  if p_quota_type = 'chat' then
    if q.free_chat_daily > 0 then selected_field := 'free_chat_daily'; selected_remaining := q.free_chat_daily - 1;
    elsif q.paid_chat_remaining > 0 then selected_field := 'paid_chat_remaining'; selected_remaining := q.paid_chat_remaining - 1;
    end if;
  elsif p_quota_type = 'resume' then
    if q.free_resume_daily > 0 then selected_field := 'free_resume_daily'; selected_remaining := q.free_resume_daily - 1;
    elsif q.paid_resume_remaining > 0 then selected_field := 'paid_resume_remaining'; selected_remaining := q.paid_resume_remaining - 1;
    end if;
  elsif p_quota_type = 'interview' then
    if q.paid_interview_remaining > 0 then selected_field := 'paid_interview_remaining'; selected_remaining := q.paid_interview_remaining - 1;
    elsif q.free_chat_daily > 0 then selected_field := 'free_chat_daily'; selected_remaining := q.free_chat_daily - 1;
    end if;
  end if;

  if selected_field is null then
    return query select null::uuid, false, null::text, 0;
    return;
  end if;

  if selected_field = 'free_chat_daily' then update public.user_quotas set free_chat_daily = selected_remaining, updated_at = now() where user_id = p_user_id;
  elsif selected_field = 'free_resume_daily' then update public.user_quotas set free_resume_daily = selected_remaining, updated_at = now() where user_id = p_user_id;
  elsif selected_field = 'paid_chat_remaining' then update public.user_quotas set paid_chat_remaining = selected_remaining, updated_at = now() where user_id = p_user_id;
  elsif selected_field = 'paid_resume_remaining' then update public.user_quotas set paid_resume_remaining = selected_remaining, updated_at = now() where user_id = p_user_id;
  elsif selected_field = 'paid_interview_remaining' then update public.user_quotas set paid_interview_remaining = selected_remaining, updated_at = now() where user_id = p_user_id;
  end if;

  insert into public.quota_usage_ledger(user_id, quota_type, source_field, idempotency_key)
    values (p_user_id, p_quota_type, selected_field, p_idempotency_key)
    returning id into new_id;
  return query select new_id, true, selected_field, selected_remaining;
end;
$$;

revoke execute on function public.reserve_user_quota(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_user_quota(uuid, text, text) to service_role;
