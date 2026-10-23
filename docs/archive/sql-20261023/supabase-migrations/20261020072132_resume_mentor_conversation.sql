-- Discussion is private task state, not résumé evidence or interview answers.
-- Migration version aligned with the confirmed production MCP migration ledger.
-- Existing rows receive an empty conversation; answers/results/leases stay intact.
alter table public.coach_resume_tasks
  add column conversation jsonb not null default '[]'::jsonb
  check (jsonb_typeof(conversation) = 'array');
comment on column public.coach_resume_tasks.conversation is
  'Owner-scoped résumé discussion and validated editor decisions; never a career fact source by itself.';
