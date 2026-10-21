// Explicit real-model acceptance with synthetic accounts only. Never prints cookies/keys.
// node --env-file=<private ops env> scripts/verify-resume-experience-trial.mjs <dpl_id|formal> <private-state.json>
// Keep the synthetic fixtures for browser acceptance, then run with --cleanup.
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import assert from 'node:assert/strict';

const [target,statePath,mode]=process.argv.slice(2);
assert.ok(target==='formal'||/^dpl_[A-Za-z0-9]+$/.test(target||''));
assert.match(statePath||'',/^\/tmp\/yizhi-trial-[^/]+\.json$/);
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const cli='/Users/yi/.local/share/pnpm/bin/vercel';
let fixtures=[];
try{fixtures=JSON.parse(await readFile(statePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
async function checked(result){if(result.error)throw result.error;return result.data;}
async function request(path,body,cookie){
  let headers,text,status;
  if(target==='formal'){
    const r=await fetch('https://yizhioffer.com'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(285000)});
    status=r.status;headers=r.headers; text=await r.text();
  }else{
    const config=['header = "Content-Type: application/json"',...(cookie?[`header = ${JSON.stringify('Cookie: '+cookie)}`]:[]),...(body?['request = "POST"',`data = ${JSON.stringify(JSON.stringify(body))}`]:[])].join('\n');
    const raw=execFileSync(cli,['curl',path,'--deployment',target,'--','--silent','--show-error','--max-time','285','--dump-header','-','--config','-'],{input:config,encoding:'utf8',timeout:295000,stdio:['pipe','pipe','pipe'],maxBuffer:4000000});
    const split=raw.lastIndexOf('\r\n\r\n'); assert.ok(split>=0,'Missing HTTP headers');
    const head=raw.slice(0,split);text=raw.slice(split+4);status=Number(/HTTP\/\S+ (\d+)/g.exec(head)?.[1]);
    headers=new Headers();for(const line of head.split('\r\n')){const n=line.indexOf(':');if(n>0)headers.append(line.slice(0,n),line.slice(n+1).trim());}
  }
  let data;try{data=JSON.parse(text);}catch{throw Error(`Non-JSON application response (HTTP ${status})`);}
  return {status,data,cookie:headers.get('set-cookie')?.match(/sb-access-token=([^;]+)/)?.[0]};
}

if(mode==='--cleanup'){
  assert.ok(fixtures.length>=1&&fixtures.length<=2,'Cleanup only fixtures created by this script');
  for(const f of fixtures){
    assert.match(f.email,/^resume-trial-qa-[a-f0-9-]+@example\.invalid$/);
    const user=await checked(await db.from('users').select('email').eq('id',f.id).maybeSingle());
    assert.equal(user?.email,f.email,'Refuse cleanup when fixture identity changed');
    for(const table of ['ai_generation_events','product_events','quota_usage_ledger','user_quotas'])await checked(await db.from(table).delete().eq('user_id',f.id));
    await checked(await db.from('invites').delete().eq('code',f.code).eq('redeemed_by',f.id));
    await checked(await db.from('users').delete().eq('id',f.id).eq('email',f.email));
    const gone=await checked(await db.from('users').select('id').eq('id',f.id));assert.equal(gone.length,0);
  }
  await unlink(statePath);console.log(JSON.stringify({syntheticFixturesRemoved:true}));process.exit(0);
}

assert.equal(fixtures.length,0,'Never rerun models using an existing fixture state; inspect it or clean it first');
const samples=[{
  selected:'2025.01-2025.03 甲门店 运营实习\n• 协助店长做退货记录整理工作，逐单核对退货原因，用 Excel 把同类原因归类并形成分类表，交给店长每周查看和讨论。我认为这锻炼了严谨细致的习惯和团队协作能力。',
  other:'2025.04-2025.06 乙门店 运营实习\n• 整理库存记录，交给同事核对。',
}, {
  selected:'2025.01-2025.03 虚构软件公司 产品实习\n• 参与客服工单需求梳理，阅读并按问题类型整理 40 条历史工单，用 Excel 汇总为需求清单，交给负责页面的同事讨论；该清单用于确定原型中需要补充的提示信息。这让我具备了很强的产品思维、沟通能力和认真负责的工作态度。',
  other:'2025.04-2025.06 虚构实验室 课程实习\n• 按课程要求记录实验步骤，整理成实验记录表。',
}];

for(let index=0;index<samples.length;index++){
  const sample=samples[index],id=randomUUID(),code='trialqa-'+randomUUID();
  const resume=`姓名：验收示例同学（虚构）\n教育经历\n某大学 本科\n实习经历\n${sample.selected}\n\n${sample.other}\n技能\nExcel`;
  const f={id,code,email:`resume-trial-qa-${id}@example.invalid`,resume,selected:sample.selected,index};
  fixtures.push(f);await writeFile(statePath,JSON.stringify(fixtures),{mode:0o600});
  await checked(await db.from('users').insert({id,email:f.email,provider:'invite'}));
  await checked(await db.from('user_quotas').insert({user_id:id,free_resume_daily:99,paid_resume_remaining:0,free_chat_daily:0,last_free_reset:new Date().toISOString().slice(0,10)}));
  await checked(await db.from('invites').insert({code,used:true,redeemed_by:id,uses_count:1,max_uses:1}));
  const login=await request('/api/auth/create-session',{inviteCode:code}); assert.equal(login.data.userId,id);assert.ok(login.cookie);
  const cookie=login.cookie;
  const opportunity=await request('/api/coach/opportunities',{opportunity:{workspaceType:'preparation',company:'隔离验收（虚构）',role:index?'产品实习':'运营实习',resumeText:resume,jdText:'',profileText:'',stage:'preparing_application',stageLabel:'简历修改',priority:'medium',requirements:[],activities:[],resumeChanges:[]}},cookie);
  assert.equal(opportunity.data.ok,true);f.opportunityId=opportunity.data.opportunity.id;await writeFile(statePath,JSON.stringify(fixtures),{mode:0o600});
  const before=await request('/api/quota/check',null,cookie);
  assert.equal(before.data.resumeTrial.available,true);assert.equal(before.data.checks.resume.allowed,false);assert.equal(before.data.quota.free_resume_daily,0);
  const denied=await request('/api/coach/resume-agent',{opportunityId:f.opportunityId,action:'start'},cookie);
  assert.equal(denied.data.task?.state,'failed');assert.match(denied.data.task?.error||'',/付费/);
  const noCalls=await checked(await db.from('ai_generation_events').select('id').eq('user_id',id));assert.equal(noCalls.length,0,'Full CV denial must happen before any model call');
  const start=Date.now();
  const revised=await request('/api/coach/resume-agent',{opportunityId:f.opportunityId,action:'restart',trialBlockId:'experience-2',trialExcerpt:sample.selected},cookie);
  const task=revised.data.task;f.task=task;f.elapsedMs=Date.now()-start;await writeFile(statePath,JSON.stringify(fixtures),{mode:0o600});
  assert.equal(task?.state,'ready',task?.error||'Expected saved generation');assert.ok(task.result?.changes?.length,'Must produce an actually useful change');
  assert.equal(task.editScope?.excerpt,sample.selected);assert.ok(task.result.resumeGenerationId);
  for(const change of task.result.changes){assert.ok(sample.selected.includes(change.before),'No edit outside selected experience');assert.notEqual(change.before,change.after);assert.ok(!change.after.includes(sample.other));}
  const read=await request(`/api/coach/resume-agent?opportunityId=${f.opportunityId}`,null,cookie);assert.deepEqual(read.data.task.result,task.result);assert.deepEqual(read.data.task.editScope,task.editScope);
  const saved=await request('/api/coach/opportunities',null,cookie);const own=saved.data.opportunities.find(o=>o.id===f.opportunityId);assert.equal(own.resumeText,resume);assert.deepEqual(own.resumeChanges,task.result.changes);
  const after=await request('/api/quota/check',null,cookie);assert.equal(after.data.resumeTrial.available,false);
  const modelEvents=await checked(await db.from('ai_generation_events').select('provider,model,status,latency_ms,failure_type').eq('user_id',id));
  assert.ok(modelEvents.some(e=>e.provider==='stepfun'&&e.status==='success'),'Must use the real hosted StepFun model');
  const second=await request('/api/coach/resume-agent',{opportunityId:f.opportunityId,action:'restart',trialBlockId:'experience-2',trialExcerpt:sample.selected},cookie);assert.equal(second.data.task.state,'failed');assert.match(second.data.task.error,/一次经历体验/);
  const noSecondCalls=await checked(await db.from('ai_generation_events').select('id').eq('user_id',id));assert.equal(noSecondCalls.length,modelEvents.length);
  const ledger=await checked(await db.from('quota_usage_ledger').select('source_field,status').eq('user_id',id));assert.deepEqual(ledger,[{source_field:'resume_experience_trial',status:'committed'}]);
  const traces=await checked(await db.from('product_events').select('properties').eq('user_id',id).eq('event_name','resume_agent_trace'));f.traces=traces.map(t=>({traceId:t.properties.traceId,outcome:t.properties.outcome,elapsedMs:t.properties.elapsedMs}));
  const q=await checked(await db.from('user_quotas').select('free_resume_daily,paid_resume_remaining').eq('user_id',id).single());assert.equal(q.free_resume_daily,99);assert.equal(q.paid_resume_remaining,0);
  f.modelEvents=modelEvents;await writeFile(statePath,JSON.stringify(fixtures),{mode:0o600});
  console.log(JSON.stringify({sample:index+1,userId:id,opportunityId:f.opportunityId,passed:true,elapsedMs:f.elapsedMs,changes:task.result.changes.length,saveRefresh:true,secondTrialBlockedBeforeModel:true,wholeCvNotFree:true,modelEvents,traces:f.traces}));
}
