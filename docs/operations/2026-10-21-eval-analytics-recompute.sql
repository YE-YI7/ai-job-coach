-- Read-only independent reproduction of the accepted API snapshot.
-- No user IDs, user text, credentials, or writes.
with p as (
  select '2026-09-21T16:00:00Z'::timestamptz as start_at,
    '2026-10-21T12:01:00.997Z'::timestamptz as end_at
), u as (
  select users.id,users.created_at from public.users,p where created_at<p.end_at
), raw as (
  select e.*, (
    coalesce(properties->>'account_cohort','')='internal'
    or coalesce(properties->>'qa','') in ('true','1')
    or coalesce(properties->>'is_test','') in ('true','1')
    or coalesce(properties->>'source','') ~ '^growth-qa(-|$)'
    or coalesce(properties->>'environment','') in ('development','preview')
  ) as flagged from public.product_events e,p
  where e.created_at>=p.start_at and e.created_at<p.end_at
), valid as (
  select r.* from raw r where not flagged
    and (user_id is null or exists(select 1 from u where u.id=r.user_id))
    and event_name<>'resume_agent_trace'
), seq as (
  select *,date_trunc('milliseconds',created_at) as stamp,
    lag(date_trunc('milliseconds',created_at)) over(
      partition by event_identity order by created_at,id
    ) as prev from valid where event_identity is not null
), credit as (
  select *,case when prev is null or stamp-prev>interval '30 minutes'
    then 0 else least(300,extract(epoch from stamp-prev)) end as seconds from seq
), cohort as (
  select u.id,(u.created_at at time zone 'Asia/Shanghai')::date as day,
    (p.end_at at time zone 'Asia/Shanghai')::date as today
  from u,p where u.created_at>=p.start_at
), retained as (
  select *,exists(select 1 from valid v where v.user_id=cohort.id
    and (v.created_at at time zone 'Asia/Shanghai')::date=cohort.day+1
  ) as returned from cohort
)
select jsonb_build_object(
  'users',(select count(*) from u),
  'newUsers',(select count(*) from cohort),
  'activeUsers',(select count(distinct user_id) from valid),
  'events',(select count(*) from valid),
  'excludedEvents',(select count(*) from raw where flagged),
  'unmatchedEvents',(select count(*) from raw r where not flagged
    and user_id is not null and not exists(select 1 from u where u.id=r.user_id)),
  'diagnosticEvents',(select count(*) from raw r where not flagged
    and event_name='resume_agent_trace'
    and (user_id is null or exists(select 1 from u where u.id=r.user_id))),
  'pv',(select count(*) from valid where event_name='page_viewed'),
  'uv',(select count(distinct event_identity) from valid where event_name='page_viewed'),
  'seconds',(select sum(seconds) from credit),
  'sessions',(select count(*) from credit where prev is null or stamp-prev>interval '30 minutes'),
  'd1Denominator',(select count(*) from retained where day+1<today),
  'd1Returned',(select count(*) from retained where day+1<today and returned),
  'd1Pending',(select count(*) from retained where day+1>=today)
);
