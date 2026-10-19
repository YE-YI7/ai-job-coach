-- Supabase default privileges also grant service_role broad DML. Narrow only
-- these new private tables, without changing shared schema defaults.
revoke all on public.coach_eval_feedback, public.coach_eval_batches from service_role;
grant select, insert on public.coach_eval_feedback to service_role;
grant select, insert, update on public.coach_eval_batches to service_role;
