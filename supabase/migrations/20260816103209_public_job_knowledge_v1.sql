-- Public, source-attributed job-market knowledge. The application accesses
-- these tables server-side with service_role; raw source articles are not copied.

create table if not exists public.job_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('github','reddit','linkedin','nowcoder','xiaohongshu','other')),
  source_kind text not null check (source_kind in ('interview_experience','job_search_story','question_bank','guide','discussion')),
  canonical_url text not null unique,
  title text not null,
  author text,
  published_at date,
  language text not null default 'zh-CN',
  company text,
  roles text[] not null default '{}'::text[],
  stages text[] not null default '{}'::text[],
  summary text not null,
  key_points text[] not null default '{}'::text[],
  interview_questions text[] not null default '{}'::text[],
  rights_mode text not null default 'summary_only' check (rights_mode in ('summary_only','public_excerpt','user_submitted','licensed')),
  quality_score smallint not null default 60 check (quality_score between 0 and 100),
  source_metadata jsonb not null default '{}'::jsonb,
  content_hash text not null,
  is_active boolean not null default true,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_text text generated always as (
    lower(coalesce(title, '') || ' ' || coalesce(company, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(author, ''))
  ) stored
);

create table if not exists public.job_knowledge_sync_runs (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('github','reddit','linkedin','nowcoder','xiaohongshu','other')),
  source_query text not null,
  status text not null check (status in ('running','completed','partial','failed')),
  discovered_count integer not null default 0 check (discovered_count >= 0),
  stored_count integer not null default 0 check (stored_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists job_knowledge_items_search_trgm_idx on public.job_knowledge_items using gin (search_text gin_trgm_ops);
create index if not exists job_knowledge_items_platform_published_idx on public.job_knowledge_items(platform, published_at desc);
create index if not exists job_knowledge_items_company_idx on public.job_knowledge_items(company);
create index if not exists job_knowledge_items_roles_idx on public.job_knowledge_items using gin (roles);
create index if not exists job_knowledge_items_stages_idx on public.job_knowledge_items using gin (stages);

alter table public.job_knowledge_items enable row level security;
alter table public.job_knowledge_sync_runs enable row level security;
revoke all privileges on public.job_knowledge_items from anon, authenticated;
revoke all privileges on public.job_knowledge_sync_runs from anon, authenticated;
grant select, insert, update, delete on public.job_knowledge_items to service_role;
grant select, insert, update, delete on public.job_knowledge_sync_runs to service_role;

create or replace function public.search_job_knowledge(
  query_text text default null,
  role_filter text default null,
  company_filter text default null,
  platform_filter text default null,
  result_limit integer default 8
)
returns table (
  id uuid, platform text, source_kind text, canonical_url text, title text, author text,
  published_at date, company text, roles text[], stages text[], summary text,
  key_points text[], interview_questions text[], quality_score smallint, relevance real
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select item.id, item.platform, item.source_kind, item.canonical_url, item.title,
    item.author, item.published_at, item.company, item.roles, item.stages,
    item.summary, item.key_points, item.interview_questions, item.quality_score,
    (
      case when company_filter is not null and lower(coalesce(item.company, '')) = lower(company_filter) then 1.5 else 0 end +
      case when role_filter is not null and exists (
        select 1 from unnest(item.roles) role_name where lower(role_name) = lower(role_filter)
      ) then 1.2 else 0 end +
      case when query_text is not null and item.search_text like '%' || lower(query_text) || '%' then 1 else 0 end +
      similarity(item.search_text, lower(coalesce(query_text, role_filter, company_filter, '')))
    )::real as relevance
  from public.job_knowledge_items item
  where item.is_active
    and (platform_filter is null or item.platform = platform_filter)
    and (company_filter is null or coalesce(item.company, '') ilike '%' || company_filter || '%')
    and (role_filter is null or exists (
      select 1 from unnest(item.roles) role_name where role_name ilike '%' || role_filter || '%'
    ))
    and (query_text is null or query_text = '' or item.search_text ilike '%' || query_text || '%' or similarity(item.search_text, lower(query_text)) > 0.06)
  order by relevance desc, item.quality_score desc, item.published_at desc nulls last
  limit least(greatest(result_limit, 1), 30);
$$;

revoke all on function public.search_job_knowledge(text,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.search_job_knowledge(text,text,text,text,integer) to service_role;
