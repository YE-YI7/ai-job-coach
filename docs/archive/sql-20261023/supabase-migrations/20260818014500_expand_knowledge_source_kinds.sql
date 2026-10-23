alter table public.job_knowledge_items
  drop constraint if exists job_knowledge_items_source_kind_check;

alter table public.job_knowledge_items
  add constraint job_knowledge_items_source_kind_check
  check (source_kind in (
    'interview_experience',
    'job_search_story',
    'question_bank',
    'guide',
    'interview_guide',
    'interviewer_guide',
    'discussion',
    'official_job_posting'
  ));
