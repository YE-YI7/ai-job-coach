-- Read-only diagnostic, executed 2026-10-23 UTC. No DDL, user-data or point writes.
-- Exact generation, including protocol repair and final retained-document review.
select request_id, operation, status, input_tokens, output_tokens, latency_ms,
       cache_hit_tokens, retry_count, estimated_cost_usd, created_at
from public.ai_generation_events
where request_id like 'resume-task:67960ca2-3535-49ae-86a0-9473644b1e0c:11%'
order by created_at;

-- Coverage check. These are server-event intervals, NOT browser API wall times.
-- This query uses a rolling window; reruns will legitimately return a new scope.
select properties->>'account_cohort' as cohort,
       properties->>'outcome' as outcome,
       count(*) as attempts,
       count(nullif(properties->>'elapsed_ms','')) as timed_attempts,
       min(nullif(properties->>'elapsed_ms','')::numeric) as min_ms,
       max(nullif(properties->>'elapsed_ms','')::numeric) as max_ms,
       percentile_cont(0.5) within group (
         order by nullif(properties->>'elapsed_ms','')::double precision
       ) as median_ms
from public.product_events
where event_name='resume_task_outcome'
  and occurred_at >= now()-interval '24 hours'
  and properties->>'schema_version'='2'
group by 1,2
order by 1,2;

-- Archived native evidence is not rewritten by this diagnostic.
select id, label, status, legacy_trace_id,
       run->>'startedAt' as started_at, run->>'durationMs' as duration_ms,
       jsonb_array_length(coalesce(run->'spans','[]'::jsonb)) as span_count,
       md5((run->'spans')::text) as spans_md5
from public.coach_eval_runs
where id in (
  '63c83f28-8f53-4280-b264-86bc165b6ce4',
  '965ed80d-518f-4c9d-957e-220afcb70cc5',
  'c102dcae-b3d6-4bc2-b7b8-7e015840a768',
  '97d6716f-dc8a-4287-8c08-5a7a0621f16d',
  'd7c7b84c-cc9b-4a93-a8ab-b1535d69e8ea'
)
order by id;
