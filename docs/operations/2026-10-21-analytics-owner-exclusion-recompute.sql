-- Read-only acceptance template. Substitute exact API window and the private
-- operator exclusion config in memory. Never save identifiers in this artifact.
with p as (
  select '__START__'::timestamptz as start_at,
    '__END__'::timestamptz as end_at,
    array[__OWNER_IDS__]::uuid[] as excluded_users,
    array[__VISITOR_IDS__]::text[] as excluded_visitors
), all_users as (
  select u.id,u.created_at from public.users u,p where u.created_at<p.end_at
), raw as (
  select e.* from public.product_events e,p
  where e.created_at>=p.start_at and e.created_at<p.end_at
), internal as (
  select unnest(excluded_users) as id from p
  union select user_id from raw where user_id is not null and properties->>'account_cohort'='internal'
), u as (
  select * from all_users where id not in(select id from internal)
), classified as (
  select e.*,(
    coalesce(e.user_id in(select id from internal),false)
    or (e.user_id is null and coalesce(e.anon_id,'')=any(p.excluded_visitors))
    or coalesce(e.properties->>'account_cohort','')='internal'
    or coalesce(e.properties->>'qa','') in('true','1')
    or coalesce(e.properties->>'is_test','') in('true','1')
    or coalesce(e.properties->>'source','') ~ '^growth-qa(-|$)'
    or coalesce(e.properties->>'environment','') in('development','preview')
  ) as flagged from raw e,p
), valid as (
  select e.* from classified e where not flagged
    and (user_id is null or user_id in(select id from all_users))
    and event_name<>'resume_agent_trace'
), seq as (
  select *,date_trunc('milliseconds',created_at) as stamp,
    lag(date_trunc('milliseconds',created_at)) over(partition by event_identity order by created_at,id) as prev
  from valid where event_identity is not null
), credit as (
  select *,case when prev is null or stamp-prev>interval '30 minutes'
    then 0 else least(300,extract(epoch from stamp-prev)) end as seconds from seq
), cohort as (
  select u.id,(u.created_at at time zone 'Asia/Shanghai')::date as day,
    (p.end_at at time zone 'Asia/Shanghai')::date as today
  from u,p where u.created_at>=p.start_at
), retained as (
  select *,exists(select 1 from valid v where v.user_id=cohort.id
    and (v.created_at at time zone 'Asia/Shanghai')::date=cohort.day+1) as returned from cohort
)
select jsonb_build_object(
  'users',(select count(*) from u),
  'excludedUsers',(select count(*) from all_users)-(select count(*) from u),
  'newUsers',(select count(*) from cohort),
  'activeUsers',(select count(distinct user_id) from valid),
  'events',(select count(*) from valid),
  'excludedEvents',(select count(*) from classified where flagged),
  'unmatchedEvents',(select count(*) from classified where not flagged and user_id is not null and user_id not in(select id from all_users)),
  'diagnosticEvents',(select count(*) from classified where not flagged and event_name='resume_agent_trace' and (user_id is null or user_id in(select id from all_users))),
  'pv',(select count(*) from valid where event_name='page_viewed'),
  'uv',(select count(distinct event_identity) from valid where event_name='page_viewed'),
  'seconds',(select coalesce(sum(seconds),0) from credit),
  'sessions',(select count(*) from credit where prev is null or stamp-prev>interval '30 minutes'),
  'd1Denominator',(select count(*) from retained where day+1<today),
  'd1Returned',(select count(*) from retained where day+1<today and returned),
  'd1Pending',(select count(*) from retained where day+1>=today)
);
