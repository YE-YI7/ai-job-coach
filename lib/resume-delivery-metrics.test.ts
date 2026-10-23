import {businessResumeMetrics} from './admin-analytics-business';
import type {AnalyticsEvent} from './admin-analytics';
const event=(name:string,generation:string,time:string,extra:Partial<AnalyticsEvent>={}):AnalyticsEvent=>({
  id:`${name}-${generation}-${time}`,user_id:'user',event_identity:'user:user',event_name:name,created_at:time,schema_version:'2',generation_id:generation,...extra,
});

test('historical success and reply failures cannot become modern rewrite delivery',()=>{
  const old=event('resume_generation_completed','old','2026-10-21T01:00:00Z',{schema_version:null});
  expect(businessResumeMetrics([old],[old],'2026-10-21',Date.parse('2026-10-22T01:00:00Z')))
    .toMatchObject({resumeAttempts:null,resumeFailed:null,resumeDelivered:null});
});
test('persisted partial and failed attempts are counted separately and deduplicated',()=>{
  const rows=[event('resume_task_started','a','2026-10-21T01:00:00Z'),
    event('resume_task_outcome','a','2026-10-21T01:01:00Z',{delivery_outcome:'partial_delivered',persistence:'confirmed'}),
    event('resume_task_started','b','2026-10-21T02:00:00Z'),
    event('resume_task_outcome','b','2026-10-21T02:01:00Z',{delivery_outcome:'failed',persistence:'not_persisted',reason_code:'resume_empty_response'})];
  expect(businessResumeMetrics(rows,[...rows,rows[1]],'2026-10-21',Date.parse('2026-10-22T01:00:00Z')))
    .toMatchObject({resumeAttempts:2,resumeDelivered:0,resumePartial:1,resumeFailed:1,resumeUnconfirmed:0});
});
test('a next-day outcome does not make the earlier started day an orphaned failure',()=>{
  const started=event('resume_task_started','a','2026-10-21T15:59:00Z');
  const ended=event('resume_task_outcome','a','2026-10-21T16:01:00Z',{delivery_outcome:'delivered',persistence:'confirmed'});
  expect(businessResumeMetrics([started,ended],[started],'2026-10-21',Date.parse('2026-10-22T01:00:00Z')))
    .toMatchObject({resumeAttempts:1,resumeDelivered:0,resumeUnconfirmed:0});
  expect(businessResumeMetrics([started,ended],[ended],'2026-10-22',Date.parse('2026-10-22T01:00:00Z')))
    .toMatchObject({resumeAttempts:0,resumeDelivered:1,resumeUnconfirmed:0});
});
