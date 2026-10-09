// Dedicated synthetic acceptance. Never uses real-user cookies, materials or balances.
// NODE_USE_ENV_PROXY=1 node --env-file=.env.ops.local scripts/verify-material-intake-flow.mjs <dpl_ID|formal>
import { createClient } from '@supabase/supabase-js';
import { randomUUID, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const target = process.argv[2];
if (target !== 'formal' && !/^dpl_[a-zA-Z0-9]+$/.test(target || '')) throw Error('Expected formal or deployment id');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const userId = randomUUID(), requestId = randomUUID();
const payload = Buffer.from(JSON.stringify({userId, version:2, exp:Math.floor(Date.now()/1000)+900})).toString('base64url');
const cookie = 'sb-access-token=' + payload + '.' + createHmac('sha256', process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest('base64url');
async function request(path, body, stream = false) {
  if (target === 'formal') {
    const response = await fetch('https://www.ai-job-coach.xin' + path, {method:body?'POST':'GET', headers:{Cookie:cookie,'Content-Type':'application/json',...(stream?{Accept:'application/x-ndjson','X-Intake-Request-Id':requestId}:{})}, body:body?JSON.stringify(body):undefined, signal:AbortSignal.timeout(100000), redirect:'error'});
    assert.ok(response.ok, `Application HTTP ${response.status}`);
    if (!stream) return response.json();
    assert.match(response.headers.get('content-type') || '', /application\/x-ndjson/);
    const start=Date.now(), reader=response.body.getReader(), decoder=new TextDecoder();let text='', firstProgressMs=null;
    while(true) { const {done,value}=await reader.read();if(done)break;text+=decoder.decode(value,{stream:true});if(firstProgressMs===null&&text.includes('"type":"progress"'))firstProgressMs=Date.now()-start; }
    text+=decoder.decode();return {events:text.trim().split('\n').map(JSON.parse),firstProgressMs};
  }
  const config=[`header = ${JSON.stringify('Cookie: '+cookie)}`,'header = "Content-Type: application/json"',...(stream?['header = "Accept: application/x-ndjson"',`header = ${JSON.stringify('X-Intake-Request-Id: '+requestId)}`]:[]),...(body?['request = "POST"','data = '+JSON.stringify(JSON.stringify(body))]:[])].join('\n');
  const text=execFileSync('vercel',['curl',path,'--deployment',target,'--','--silent','--show-error','--fail-with-body','--max-time','100','--config','-'],{input:config,encoding:'utf8',timeout:110000,stdio:['pipe','pipe','pipe']});
  return stream?{events:text.trim().split('\n').map(JSON.parse),firstProgressMs:null}:JSON.parse(text);
}
try {
  let result=await db.from('users').insert({id:userId,email:`intake-acceptance-${userId}@example.invalid`});if(result.error)throw result.error;
  result=await db.from('user_quotas').insert({user_id:userId,free_chat_daily:1,last_free_reset:new Date().toISOString().slice(0,10)});if(result.error)throw result.error;
  const info=await request('/api/opportunities/intake-info');assert.match(info.provider,/StepFun|DeepSeek/);
  const started=Date.now();
  const analyzed=await request('/api/opportunities/analyze',{sourceText:'验收示例公司招聘产品经理\n职责：梳理用户需求，推进产品交付并跟踪反馈。\n要求：本科，有产品实习经历；地点上海。',requestId},true);
  const data=analyzed.events.find(event=>event.type==='result')?.data;
  assert.equal(data?.ok,true);assert.notEqual(data.analysisDeferred,true);assert.equal(data.status,200);assert.equal(data.requestId,requestId);
  assert.deepEqual(analyzed.events.filter(event=>event.type==='progress').map(event=>event.phase),['reading','analyzing','checking']);
  assert.equal(data.input.workspaceType,'job');assert.match(data.input.company,/验收示例/);assert.match(data.input.role,/产品经理/);
  assert.equal(data.input.resumeText,'');assert.ok(data.analysis.requirements.length>0);assert.ok(data.analysis.requirements.every(item=>item.strength!=='strong'));
  const intakeMs=Date.now()-started;
  const body={intakeRequestId:requestId,opportunity:{...data.input,...data.analysis,stage:'evaluating',stageLabel:'评估中',priority:'medium',capturedAtLabel:'刚刚',nextEventLabel:'补充简历',activities:[],resumeChanges:[]}};
  const saved=await request('/api/coach/opportunities',body);assert.equal(saved.ok,true);
  const replay=await request('/api/coach/opportunities',body);assert.equal(replay.ok,true);assert.equal(replay.replay,true);assert.equal(replay.opportunity.id,saved.opportunity.id);
  const list=await request('/api/coach/opportunities');const matching=list.opportunities.filter(item=>item.intakeRequestId===requestId);
  assert.equal(matching.length,1);assert.equal(matching[0].jdText,data.input.jdText);
  const {data:quota,error}=await db.from('user_quotas').select('free_chat_daily').eq('user_id',userId).single();if(error)throw error;assert.equal(quota.free_chat_daily,0);
  const audit=await db.from('ai_generation_events').select('provider,model,status').eq('user_id',userId);if(audit.error)throw audit.error;
  assert.equal(audit.data.filter(item=>item.status==='success').length,1);
  console.log(JSON.stringify({target,passed:true,provider:info.provider,actualModel:audit.data[0]?.model,phases:['reading','analyzing','checking'],firstProgressMs:analyzed.firstProgressMs,intakeMs,cloudSaved:true,lostResponseReplaySameId:true,cloudCopies:matching.length,saveAtZeroQuota:true,modelCalls:audit.data.length}));
} finally {
  const audit=await db.from('ai_generation_events').delete().eq('user_id',userId);if(audit.error)throw audit.error;
  const removed=await db.from('users').delete().eq('id',userId);if(removed.error)throw removed.error;
  const check=await db.from('users').select('id',{count:'exact',head:true}).eq('id',userId);if(check.error)throw check.error;assert.equal(check.count,0);
  console.log('Only this run synthetic user and own generation events removed.');
}
