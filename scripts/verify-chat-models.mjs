// Owner-authorized test through normal context/billing. Removes only its own session.
// node --env-file=.env.ops.local scripts/verify-chat-models.mjs <authorized-opportunity-id>
import {createClient} from '@supabase/supabase-js';
import {createHmac,randomUUID} from 'node:crypto';
const scope=process.argv[2];
if(!/^[0-9a-f-]{36}$/i.test(scope||''))throw Error('Explicit authorized opportunity required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const {data:o,error}=await db.from('coach_opportunities').select('user_id').eq('id',scope).single();
if(error)throw Error('Scoped owner lookup failed');
const payload=Buffer.from(JSON.stringify({userId:o.user_id,version:2,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
const cookie='sb-access-token='+payload+'.'+createHmac('sha256',process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest('base64url');
async function request(path,body){
 const r=await fetch('https://www.ai-job-coach.xin'+path,{method:body?'POST':'GET',headers:{cookie,'Content-Type':'application/json','x-idempotency-key':body?.requestId||randomUUID()},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});
 const b=await r.json();if(!r.ok)throw Error(`HTTP ${r.status}: ${b.error||'request failed'}`);return b;
}
let sessionId;
try{
 const access=await request('/api/coach/agent/models');
 if(!access.connected)throw Error('No connected TokenPay account');
 const created=await request('/api/coach/agent/sessions',{title:'系统验证：模型连通性（临时）'});sessionId=created.session.id;
 for(const modelMode of ['qwen3.8-max-0902','kimi-k3','glm-5.3']){
  try{
   const b=await request('/api/coach/agent',{sessionId,modelMode,requestId:randomUUID(),message:'这是产品连接测试，不是学习内容。不要引用个人材料。请只回复“已连接”，不用展开，后续问题留空。'});
   console.log(JSON.stringify({requested:modelMode,ok:Boolean(b.answer),trace:b.learning_trace?.modelUsage,protocolHidden:!b.answer.includes('<followups>')}));
   if(!b.answer||!b.learning_trace?.modelUsage)process.exitCode=1;
  }catch(e){console.log(JSON.stringify({requested:modelMode,ok:false,error:e.message}));process.exitCode=1;}
 }
}finally{
 if(sessionId){const {error:e}=await db.from('coach_learning_sessions').delete().eq('id',sessionId).eq('user_id',o.user_id);if(e)throw Error('Temporary session cleanup failed');console.log('Temporary session and test turns removed; existing learning records unchanged.');}
}
