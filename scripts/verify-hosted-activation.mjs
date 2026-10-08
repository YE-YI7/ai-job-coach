// Explicit synthetic real-model acceptance; secrets never leave process memory.
// NODE_USE_ENV_PROXY=1 node --env-file=.env.ops.local scripts/verify-hosted-activation.mjs <deployment-id|formal>
import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const target=process.argv[2];
if(target!=='formal'&&!/^dpl_[a-zA-Z0-9]+$/.test(target||''))throw Error('Expected deployment id or formal');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const id=randomUUID();
console.log(JSON.stringify({syntheticTestUserId:id}));
const payload=Buffer.from(JSON.stringify({userId:id,version:2,exp:Math.floor(Date.now()/1000)+900})).toString('base64url');
const cookie='sb-access-token='+payload+'.'+createHmac('sha256',process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest('base64url');
async function request(path,body,stream=false){
  const started=Date.now();
  if(target==='formal'){
    const r=await fetch('https://www.ai-job-coach.xin'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json',...(stream?{Accept:'application/x-ndjson'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(100000),redirect:'error'});
    assert.equal(r.ok,true,`Application HTTP ${r.status}`);
    if(!stream)return r.json();
    assert.match(r.headers.get('content-type')||'',/application\/x-ndjson/);
    const reader=r.body.getReader(),decoder=new TextDecoder();let text='',firstTextMs=null;
    while(true){const {value,done}=await reader.read();if(done)break;text+=decoder.decode(value,{stream:true});if(firstTextMs===null&&/"type":"(?:delta|replace)"/.test(text))firstTextMs=Date.now()-started;}
    text+=decoder.decode();
    return {events:text.trim().split('\n').map(line=>JSON.parse(line)),firstTextMs,latencyMs:Date.now()-started};
  }
  const config=[`header = ${JSON.stringify('Cookie: '+cookie)}`,'header = "Content-Type: application/json"',...(stream?['header = "Accept: application/x-ndjson"']:[]),...(body?['request = "POST"','data = '+JSON.stringify(JSON.stringify(body))]:[])].join('\n');
  const text=execFileSync('vercel',['curl',path,'--deployment',target,'--','--silent','--show-error','--fail-with-body','--max-time','100','--config','-'],{input:config,encoding:'utf8',timeout:110000,stdio:['pipe','pipe','pipe']});
  return stream?{events:text.trim().split('\n').map(line=>JSON.parse(line)),firstTextMs:null,latencyMs:Date.now()-started}:JSON.parse(text);
}
const source='验收示例公司招聘产品经理\n职责：梳理用户需求，推进产品交付并跟踪反馈。\n要求：本科，有产品实习经历；地点上海。';
try{
  let r=await db.from('users').insert({id,email:`hosted-activation-${id}@example.invalid`});if(r.error)throw r.error;
  r=await db.from('user_quotas').insert({user_id:id,free_chat_daily:3,last_free_reset:new Date().toISOString().slice(0,10)});if(r.error)throw r.error;
  const start=Date.now();
  const intake=await request('/api/opportunities/analyze',{sourceText:source,requestId:'hosted-activation-'+randomUUID()});
  const intakeMs=Date.now()-start;
  assert.equal(intake.ok,true);assert.notEqual(intake.analysisDeferred,true);assert.ok(intake.analysis);
  assert.equal(intake.input.workspaceType,'job');assert.match(intake.input.company,/验收示例/);assert.match(intake.input.role,/产品经理/);
  assert.equal(intake.input.resumeText,'');assert.ok(intake.analysis.requirements.length>0);
  assert.ok(intake.analysis.requirements.every(req=>req.strength!=='strong'),'No invented user evidence without resume');
  const saved=await request('/api/coach/opportunities',{opportunity:{...intake.input,...intake.analysis,stage:'evaluating',stageLabel:'评估中',priority:'medium',capturedAtLabel:'刚刚',nextEventLabel:'补充简历',activities:[],resumeChanges:[]}});
  assert.equal(saved.ok,true);
  const opportunityId=saved.opportunity.id;
  const read=await request('/api/coach/opportunities');assert.equal(read.opportunities.find(item=>item.id===opportunityId)?.jdText,intake.input.jdText);
  const session=await request('/api/coach/agent/sessions',{opportunityId,title:'验收：从零学习需求访谈'});assert.equal(session.ok,true);
  const chat=await request('/api/coach/agent',{opportunityId,sessionId:session.session.id,mode:'auto',message:'我没有做过需求访谈。请教我第一步怎么做，用一个简单的例子，然后问我一个练习问题。不要假设我已有实习经历。',requestId:randomUUID()},true);
  const done=chat.events.find(event=>event.type==='done');assert.equal(done?.ok,true,done?.error||'Missing successful done event');
  assert.ok(done.answer?.length>20);assert.ok(chat.events.some(event=>['delta','replace'].includes(event.type)&&event.text?.length));
  assert.equal(done.learning_trace.model,'step-3.7-flash');assert.equal(done.learning_trace.modelUsage.model,'step-3.7-flash');assert.ok(done.learning_trace.modelUsage.outputTokens>0);
  const history=await request(`/api/coach/agent?opportunityId=${opportunityId}&sessionId=${session.session.id}`);assert.ok(history.turns.some(turn=>turn.id===done.id&&turn.answer===done.answer));
  const {data:quota,error:qError}=await db.from('user_quotas').select('free_chat_daily').eq('user_id',id).single();if(qError)throw qError;assert.equal(quota.free_chat_daily,1);
  const {data:events,error:eError}=await db.from('ai_generation_events').select('provider,model,status').eq('user_id',id);if(eError)throw eError;
  assert.ok(events.some(event=>event.provider==='stepfun'&&event.status==='success'));
  console.log(JSON.stringify({target,passed:true,genuineAiIntake:true,intakeMs,streamingTutorSaved:true,tutorFirstTextMs:chat.firstTextMs,tutorLatencyMs:chat.latencyMs,actualModel:done.learning_trace.modelUsage.model,outputTokens:done.learning_trace.modelUsage.outputTokens,freeUsesRemaining:quota.free_chat_daily,originalMaterialPersisted:true}));
}finally{
  const audit=await db.from('ai_generation_events').delete().eq('user_id',id);if(audit.error)throw audit.error;
  const {error}=await db.from('users').delete().eq('id',id);if(error)throw error;
  const {count,error:checkError}=await db.from('users').select('id',{count:'exact',head:true}).eq('id',id);if(checkError)throw checkError;assert.equal(count,0);
  console.log('Synthetic user and own generation events removed.');
}
