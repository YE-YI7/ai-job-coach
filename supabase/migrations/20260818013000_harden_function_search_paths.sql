alter function public.update_updated_at_column() set search_path = public, pg_temp;
alter function public.update_memory_timestamp() set search_path = public, pg_temp;
alter function public.get_active_memory_count(uuid, text) set search_path = public, pg_temp;
alter function public.get_unsummarized_message_count(uuid, text) set search_path = public, pg_temp;
alter function public.update_review_session_updated_at() set search_path = public, pg_temp;
alter function public.update_review_task_updated_at() set search_path = public, pg_temp;
