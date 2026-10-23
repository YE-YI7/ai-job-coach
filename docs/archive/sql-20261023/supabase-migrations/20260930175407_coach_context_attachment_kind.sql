-- Expands the existing audit kind allow-list; no data or access policy changes.
begin;
set local lock_timeout = '5s';
alter table public.coach_run_context_selections drop constraint coach_run_context_selections_kind_check;
alter table public.coach_run_context_selections add constraint coach_run_context_selections_kind_check
  check (kind in ('current_input','question_source','attachment','opportunity','artifact','confirmed_fact','recent_practice','knowledge','history_summary'));
commit;
