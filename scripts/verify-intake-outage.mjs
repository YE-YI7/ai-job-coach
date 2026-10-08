// Explicit synthetic outage acceptance. Never uses or prints a real user's cookie.
// node --env-file=.env.ops.local scripts/verify-intake-outage.mjs <deployment-id|formal>
import { createClient } from '@supabase/supabase-js';
import { randomUUID, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const target = process.argv[2];
if (target !== 'formal' && !/^dpl_[a-zA-Z0-9]+$/.test(target || '')) throw Error('Expected deployment id or formal');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = randomUUID();
console.log(JSON.stringify({syntheticTestUserId:id}));
const payload = Buffer.from(JSON.stringify({ userId: id, version: 2, exp: Math.floor(Date.now()/1000)+600 })).toString('base64url');
const cookie = 'sb-access-token='+payload+'.'+createHmac('sha256',process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest('base64url');
async function request(path, body) {
  if (target === 'formal') {
    const response = await fetch('https://www.ai-job-coach.xin'+path, { method: body ? 'POST':'GET', headers: { Cookie: cookie, 'Content-Type':'application/json' }, body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000) });
    assert.equal(response.ok,true,`Application HTTP ${response.status}`);
    return response.json();
  }
  // Credentials and request body go via stdin, not argv or a saved trace.
  const config = [`header = ${JSON.stringify('Cookie: '+cookie)}`, 'header = "Content-Type: application/json"', ...(body ? ['request = "POST"','data = '+JSON.stringify(JSON.stringify(body))]:[])].join('\n');
  const output=execFileSync('vercel',['curl',path,'--deployment',target,'--','--silent','--show-error','--fail-with-body','--max-time','90','--config','-'],{input:config,encoding:'utf8',timeout:100000,stdio:['pipe','pipe','pipe']});
  return JSON.parse(output);
}
const source = '验收示例公司招聘产品经理\n职责：梳理用户需求，推进产品交付并跟踪反馈。\n要求：本科，有产品实习经历；地点上海。';
try {
  let result=await db.from('users').insert({id,email:`intake-outage-${id}@example.invalid`}); if(result.error)throw result.error;
  result=await db.from('user_quotas').insert({user_id:id,free_chat_daily:3,last_free_reset:new Date().toISOString().slice(0,10)});if(result.error)throw result.error;
  const intake=await request('/api/opportunities/analyze',{sourceText:source,requestId:'intake-outage-test-'+randomUUID()});
  assert.equal(intake.ok,true);assert.equal(intake.analysis,null);assert.equal(intake.analysisDeferred,true);assert.equal(intake.reasonCode,'hosted_provider_quota');
  assert.equal(intake.input.profileText,source);assert.equal(intake.input.jdText,'');assert.equal(intake.input.resumeText,'');
  const {data:quota,error:qError}=await db.from('user_quotas').select('free_chat_daily').eq('user_id',id).single();if(qError)throw qError;assert.equal(quota.free_chat_daily,3);
  const saved=await request('/api/coach/opportunities',{opportunity:{...intake.input,stage:'evaluating',stageLabel:'准备中',priority:'medium',sourceLabel:'合成验收材料',capturedAtLabel:'刚刚',nextEventLabel:'等待站点服务恢复',recommendation:'prepare_then_apply',recommendationLabel:'等待完成分析',recommendationReason:'原文已保存；未形成AI结论',evidenceCoverage:{strong:0,weak:0,missing:0,unverified:0},requirements:[],actions:[],activities:[],resumeChanges:[],interviewFocus:[]}});
  assert.equal(saved.ok,true);
  const read=await request('/api/coach/opportunities');
  assert.equal(read.opportunities.find(item=>item.id===saved.opportunity.id)?.profileText,source);
  console.log(JSON.stringify({target,passed:true,analysisDeferred:true,freeUsesRemaining:3,originalSourcePersisted:true,aiAnalysisRestored:false}));
} finally {
  // Generation audit rows intentionally have no user FK; remove only this fixture's rows.
  const audit=await db.from('ai_generation_events').delete().eq('user_id',id);if(audit.error)throw audit.error;
  const {error}=await db.from('users').delete().eq('id',id);if(error)throw error;
  const {count,error:checkError}=await db.from('users').select('id',{count:'exact',head:true}).eq('id',id);if(checkError)throw checkError;assert.equal(count,0);
  console.log('Synthetic user removed; session was held only in process memory.');
}
