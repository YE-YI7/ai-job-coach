// Real public-source + hosted-model + persistence acceptance, synthetic account only.
// NODE_USE_ENV_PROXY=1 node --env-file=.env.ops.local scripts/verify-hosted-discovery.mjs <deployment-id|formal>
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
async function request(path,body){
  if(target==='formal'){
    const r=await fetch('https://www.ai-job-coach.xin'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(150000),redirect:'error'});
    const result=await r.json();assert.equal(r.ok,true,`HTTP ${r.status}: ${result.error||''}`);return result;
  }
  const config=[`header = ${JSON.stringify('Cookie: '+cookie)}`,'header = "Content-Type: application/json"',...(body?['request = "POST"','data = '+JSON.stringify(JSON.stringify(body))]:[])].join('\n');
  const text=execFileSync('vercel',['curl',path,'--deployment',target,'--','--silent','--show-error','--fail-with-body','--max-time','150','--config','-'],{input:config,encoding:'utf8',timeout:160000,stdio:['pipe','pipe','pipe']});return JSON.parse(text);
}
const resume='本科学历，5年AI产品经理工作经验。2021年至2026年在示例企业负责AI产品。主导企业知识库RAG问答产品，负责需求访谈、产品设计、模型评测和上线跟踪。负责Agent任务流程、工具调用失败恢复、回答引用核验。使用SQL分析用户留存与反馈，设计A/B实验验证功能效果。参与销售、研发和交付协作，推动B端AI产品落地。';
try{
  let r=await db.from('users').insert({id,email:`hosted-discovery-${id}@example.invalid`});if(r.error)throw r.error;
  r=await db.from('user_quotas').insert({user_id:id,free_chat_daily:1,last_free_reset:new Date().toISOString().slice(0,10)});if(r.error)throw r.error;
  const saved=await request('/api/coach/opportunities',{opportunity:{workspaceType:'preparation',company:'求职准备',role:'AI 产品经理',location:'北京 上海 深圳',jdText:'',resumeText:resume,profileText:'目标AI产品经理',sourceLabel:'合成验收材料',stage:'evaluating',stageLabel:'准备中',priority:'medium',capturedAtLabel:'刚刚',nextEventLabel:'按简历找岗位',recommendation:'prepare_then_apply',recommendationLabel:'准备中',recommendationReason:'待搜岗',evidenceCoverage:{strong:0,weak:0,missing:0,unverified:0},requirements:[],actions:[],activities:[],resumeChanges:[],interviewFocus:[]}});
  assert.equal(saved.ok,true);const profileId=saved.opportunity.id,requestId=randomUUID(),start=Date.now();
  const result=await request('/api/coach/jobs/discover',{profileId,requestId});const durationMs=Date.now()-start;
  assert.ok(Array.isArray(result.jobs));assert.ok(result.jobs.length>0,'No reviewed recommendations');assert.ok(result.jobs.length<=5);
  assert.equal(result.personalization.modelCalls,1);assert.ok(result.personalization.evaluatedCount>=8,'Must cover a substantial reasoning pool');
  assert.ok(result.jobs.every(job=>job.review&&job.url?.startsWith('https://')&&job.description));
  const restored=await request(`/api/coach/jobs/discover?profileId=${profileId}`);assert.equal(restored.found,true);assert.deepEqual(restored.result.jobs,result.jobs);
  const replay=await request('/api/coach/jobs/discover',{profileId,requestId});assert.deepEqual(replay.jobs,result.jobs);
  const {data:quota,error:qError}=await db.from('user_quotas').select('free_chat_daily').eq('user_id',id).single();if(qError)throw qError;assert.equal(quota.free_chat_daily,0);
  const {data:events,error:eError}=await db.from('ai_generation_events').select('provider,model,status,output_tokens,latency_ms').eq('request_id',result.runId).eq('user_id',id);if(eError)throw eError;
  assert.equal(events.length,1);assert.equal(events[0].status,'success');assert.equal(events[0].provider,'stepfun');
  console.log(JSON.stringify({target,passed:true,durationMs,evaluatedCount:result.personalization.evaluatedCount,jobs:result.jobs.map(job=>({company:job.company,title:job.title,url:job.url})),model:events[0].model,outputTokens:events[0].output_tokens,modelMs:events[0].latency_ms,restored:true,replayWithoutExtraCharge:true,remainingFreeUses:0,status:restored.status,failedSourceCount:result.failedSources.length}));
}finally{
  const audit=await db.from('ai_generation_events').delete().eq('user_id',id);if(audit.error)throw audit.error;
  const {error}=await db.from('users').delete().eq('id',id);if(error)throw error;
  const {count,error:checkError}=await db.from('users').select('id',{count:'exact',head:true}).eq('id',id);if(checkError)throw checkError;assert.equal(count,0);
  console.log('Synthetic discovery account and own generation audit removed.');
}
