// Owner-authorized test through normal context/billing. Removes only its own session.
// node --env-file=.env.ops.local scripts/verify-chat-models.mjs <authorized-opportunity-id>
import {createClient} from '@supabase/supabase-js';
import {createHmac,randomUUID} from 'node:crypto';
const scope=process.argv[2];
const streaming=process.argv.includes('--stream');
const streamModel=process.argv.find(arg=>arg.startsWith('--model='))?.slice(8)||'auto';
if(!/^[0-9a-f-]{36}$/i.test(scope||''))throw Error('Explicit authorized opportunity required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const {data:o,error}=await db.from('coach_opportunities').select('user_id').eq('id',scope).single();
if(error)throw Error('Scoped owner lookup failed');
const payload=Buffer.from(JSON.stringify({userId:o.user_id,version:2,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
const cookie='sb-access-token='+payload+'.'+createHmac('sha256',process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest('base64url');
async function request(path,body){
 const started=Date.now();
 const r=await fetch('https://www.ai-job-coach.xin'+path,{method:body?'POST':'GET',headers:{cookie,'Content-Type':'application/json',...(streaming&&path==='/api/coach/agent'?{Accept:'application/x-ndjson'}:{}),'x-idempotency-key':body?.requestId||randomUUID()},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});
 if(r.headers.get('content-type')?.includes('application/x-ndjson')){
  const decoder=new TextDecoder();
  let buffer='',firstDeltaMs=null,deltaCount=0,result;
  for await(const bytes of r.body){
   buffer+=decoder.decode(bytes,{stream:true});
   const lines=buffer.split('\n');buffer=lines.pop()||'';
   for(const line of lines){if(!line)continue;const event=JSON.parse(line);if(event.type==='delta'){firstDeltaMs??=Date.now()-started;deltaCount++;}if(event.type==='done')result=event;}
  }
  console.log(JSON.stringify({firstDeltaMs,completedMs:Date.now()-started,deltaCount,saved:Boolean(result?.ok)}));
  if(!result?.ok)throw Error(result?.error||'No confirmed completion');
  return result;
 }
 const b=await r.json();if(!r.ok)throw Error(`HTTP ${r.status}: ${b.error||'request failed'}`);return b;
}
let sessionId;
try{
 const access=await request('/api/coach/agent/models');
 if(!access.connected)throw Error('No connected TokenPay account');
 const created=await request('/api/coach/agent/sessions',{title:'系统验证：模型连通性（临时）'});sessionId=created.session.id;
 for(const modelMode of streaming?[streamModel]:['qwen3.8-max-0902','kimi-k3','glm-5.3']){
  try{
   const input={sessionId,modelMode,requestId:randomUUID(),message:streaming?'请教我如何设计一个RAG召回评测，用一个简短例子说明，再给我一道练习题。不需要使用我的个人经历。':'这是产品连接测试，不是学习内容。不要引用个人材料。请只回复“已连接”，不用展开，后续问题留空。'};
   const b=await request('/api/coach/agent',input);
   console.log(JSON.stringify({requested:modelMode,ok:Boolean(b.answer),trace:b.learning_trace?.modelUsage,protocolHidden:!b.answer.includes('<followups>')}));
   if(!b.answer||!b.learning_trace?.modelUsage)process.exitCode=1;
   if(streaming){const history=await request('/api/coach/agent?sessionId='+sessionId);if(!history.turns.some(t=>t.id===b.id&&t.answer===b.answer))throw Error('Saved history mismatch');const again=await request('/api/coach/agent',input);if(again.id!==b.id)throw Error('Idempotency mismatch');console.log('History readback and idempotent replay verified.');}
  }catch(e){console.log(JSON.stringify({requested:modelMode,ok:false,error:e.message}));process.exitCode=1;}
 }
}finally{
 if(sessionId){const {error:e}=await db.from('coach_learning_sessions').delete().eq('id',sessionId).eq('user_id',o.user_id);if(e)throw Error('Temporary session cleanup failed');console.log('Temporary session and test turns removed; existing learning records unchanged.');}
}
