// Explicit smoke test: creates only synthetic users; removes its own test rows in finally.
// node --env-file=.env.ops.local scripts/verify-learning-loop.mjs https://www.ai-job-coach.xin
import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://localhost:3000';
if(!['http://localhost:3000','https://www.ai-job-coach.xin'].includes(base))throw Error('Unexpected test destination');
// Retry only read-side transport failures; never replay a potentially committed write.
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{global:{fetch:async(input,init)=>{
 const attempts=(init?.method||'GET').toUpperCase()==='GET'?3:1;
 for(let attempt=0;attempt<attempts;attempt++){
  try{return await fetch(input,init);}catch(error){if(attempt===attempts-1)throw error;}
 }
 throw Error('Read retries exhausted');
}}});
const id=randomUUID(),other=randomUUID();
function cookie(uid){const p=Buffer.from(JSON.stringify({userId:uid,version:2,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');return 'sb-access-token='+p+'.'+createHmac('sha256',process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY).update(p).digest('base64url');}
async function request(path,body,uid=id){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie:cookie(uid),'Content-Type':'application/json','x-idempotency-key':body?.requestId||randomUUID()},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});const b=await r.json();assert.equal(r.ok,true,JSON.stringify({path,status:r.status,body:b}));return b;}
try{
 const {error}=await db.from('users').insert([{id,email:`learning-smoke-${id}@example.invalid`},{id:other,email:`learning-smoke-${other}@example.invalid`}]);if(error)throw error;
 const {error:quotaError}=await db.from('user_quotas').insert({user_id:id,free_chat_daily:10,last_free_reset:new Date().toISOString().slice(0,10)});if(quotaError)throw quotaError;
 const s=await request('/api/coach/agent/sessions',{title:'测试：学会区分问题与方案'});
 const first=await request('/api/coach/agent',{sessionId:s.session.id,message:'我是刚开始学产品的学生，没有简历和JD。教我区分用户问题和解决方案。先用一个日常例子解释，然后只出一道题，等我回答。',requestId:randomUUID()});
 console.log('FIRST',first.answer);
 const second=await request('/api/coach/agent',{sessionId:s.session.id,message:'我先试着表达：校园食堂排队久，是问题；做一个预约取餐小程序，是方案。但我还不知道该先找什么证据。请指出我的表述哪里成立、哪里要补，再让我试一步。',requestId:randomUUID()});
 console.log('FEEDBACK',second.answer);
 const history=await request(`/api/coach/agent?sessionId=${s.session.id}`);assert.equal(history.turns.length,2);
 const foreign=await request(`/api/coach/agent?sessionId=${s.session.id}`,undefined,other);assert.equal(foreign.turns.length,0);
 const archived=await request('/api/coach/agent/archive',{sessionId:s.session.id});assert.ok(archived.summary.includes('原始回答节选'));console.log('ARCHIVE',archived.summary);
 const fresh=await request('/api/coach/agent/sessions',{title:'测试：继续上次卡点'});
 assert.equal((await request(`/api/coach/agent?sessionId=${fresh.session.id}`)).turns.length,0);
 const next=await request('/api/coach/agent',{sessionId:fresh.session.id,message:'请读取我上次学习进展，从还没解决的地方接着练；别要求我重新介绍背景。',requestId:randomUUID()});console.log('NEXT',next.answer);
 const {data:trace,error:traceError}=await db.from('coach_agent_turns').select('learning_trace').eq('id',next.id).eq('user_id',id).single();if(traceError)throw traceError;
 assert.equal(trace.learning_trace.memoryLoaded,true);assert.equal(trace.learning_trace.modelCalls,1);assert.ok(trace.learning_trace.inputTokens<=8000);
 const {data:notes}=await db.from('coach_memory_documents').select('path').eq('user_id',id);assert.ok(notes.some(n=>n.path==='profile/overview.md'));
 console.log('PASS persisted turns, isolated owner, archive, empty new context, memory reload, one model call, budget',JSON.stringify(trace.learning_trace));
}finally{
 const {error}=await db.from('users').delete().in('id',[id,other]);if(error)throw error;
 console.log('Removed synthetic test accounts and cascading test records.');
}
