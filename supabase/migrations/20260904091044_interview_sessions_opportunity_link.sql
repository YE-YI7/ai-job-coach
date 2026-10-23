alter table public.interview_sessions
  add column if not exists opportunity_id uuid
  references public.coach_opportunities(id) on delete set null;

create index if not exists interview_sessions_opportunity_id_idx
  on public.interview_sessions(opportunity_id);
