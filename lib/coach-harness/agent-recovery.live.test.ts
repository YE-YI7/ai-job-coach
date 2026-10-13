/** 显式运行：真实数据库/额度/上游模型，最多3次成功模型调用；认证仅注入隔离测试身份，不伪造浏览器登录。 */
import {randomUUID} from 'node:crypto';
import {POST,GET} from '@/app/api/coach/agent/route';
import {getDbClient} from '@/lib/db';
import {getCurrentUserFromRequest} from '@/lib/auth';
jest.mock('@/lib/auth',()=>({getCurrentUserFromRequest:jest.fn()}));
const live=process.env.RUN_HARNESS_RECOVERY_LIVE==='1'?test:test.skip;
live('真实持久化/故障退款/10并发/零额度重放/旧原话与简历读取',async()=>{
 jest.setTimeout(240000);
 if(process.env.LLM_STUB==='1'||process.env.HOSTED_LLM_PROVIDER!=='stepfun')throw Error('必须使用现有真实Step站点配置');
 const db=await getDbClient();if(!db)throw Error('database unavailable');
 const owner=randomUUID(),other=randomUUID(),sid=randomUUID(),job=randomUUID();
 const check=(r:{error?:unknown})=>{if(r.error)throw r.error;};
 const req=(requestId:string,message:string)=>new Request('https://qa.example.invalid/api/coach/agent',{method:'POST',headers:{accept:'application/x-ndjson','content-type':'application/json','x-idempotency-key':requestId},body:JSON.stringify({requestId,message,sessionId:sid,opportunityId:job,interactionMode:'coaching',modelMode:'fast'})});
 const result=async(r:Response)=>{const events=(await r.text()).trim().split('\n').map(s=>JSON.parse(s));return events.at(-1);};
 const actor=(id=owner)=>(getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id});
 const made:string[]=[];
 try{
  for(const id of [owner,other]){check(await db.from('users').insert({id,email:`harness-${id}@example.invalid`,invite_code:`harness-${id}`}));made.push(id);}
  actor();
  const resume=Array.from({length:130},(_,i)=>`测试经历第${i}行：整理资料与用户记录，不代表真实用户经历。`).join('\n')+'\n客服RAG项目：参与意图识别优化，测试转人工率下降18%，不是上线成果。';
  check(await db.from('coach_opportunities').insert({id:job,user_id:owner,company:'QA恢复实验室（虚构）',role:'产品经理',stage:'captured',jd_text:'负责客服RAG产品，关注意图识别和评测。',metadata:{resumeText:resume}}));
  check(await db.from('coach_learning_sessions').insert({id:sid,user_id:owner,opportunity_id:job,title:'QA harness live（虚构材料）'}));
  const oldest=randomUUID();
  check(await db.from('coach_agent_turns').insert(Array.from({length:21},(_,i)=>({id:i===0?oldest:randomUUID(),user_id:owner,session_id:sid,opportunity_id:job,request_id:randomUUID(),question:i===0?'测试限制：我只考虑杭州，不考虑上海，请记住这条限制。':`这是虚构测试对话第${i}轮：请解释求职材料的来源。`,answer:'构造历史，不是模型效果证据。',context_fingerprint:'qa-fixture',created_at:new Date(Date.now()-(22-i)*10000).toISOString()}))));
  const ask='请根据我的客服RAG项目原句和早先说的城市限制，只用两句话指出一个待核实项。这些都是虚构测试材料，不要重写简历。';
  const before=await db.from('user_quotas').select('free_chat_daily').eq('user_id',owner).maybeSingle();check(before);
  const nativeFetch=global.fetch;
  const fault=jest.spyOn(global,'fetch').mockImplementation(async(url,options)=>{
   const address=typeof url==='string'?url:url instanceof URL?url.href:url.url;
   if(address.startsWith('https://api.stepfun.com/'))throw Error('LLM_REQUEST_TIMEOUT');
   return nativeFetch(url,options);
  });
  const failed=await result(await POST(req(randomUUID(),ask)));fault.mockRestore();
  expect(failed.ok).toBe(false);
  const restored=await db.from('user_quotas').select('free_chat_daily').eq('user_id',owner).single();check(restored);expect(restored.data.free_chat_daily).toBe(3);
  const rid=randomUUID();
  const responses=await Promise.all(Array.from({length:10},()=>POST(req(rid,ask))));
  const results=await Promise.all(responses.map(result));
  const success=results.filter(r=>r.ok);expect(success.length).toBeGreaterThanOrEqual(1);
  expect(new Set(success.map(r=>r.id)).size).toBe(1);
  const canonical=success[0];
  const generated=await db.from('ai_generation_events').select('id,status').eq('user_id',owner).eq('status','success');check(generated);expect(generated.data).toHaveLength(1);
  expect(canonical.learning_trace.historyRetrieval.turnIds).toContain(oldest);
  const saved=await db.from('coach_agent_turns').select('learning_trace').eq('id',canonical.id).single();check(saved);
  expect(saved.data.learning_trace.compiledPrompt).toContain('我只考虑杭州');
  expect(saved.data.learning_trace.compiledPrompt).toContain('测试转人工率下降18%，不是上线成果');
  const replay=await result(await POST(req(rid,ask)));expect(replay).toMatchObject({ok:true,replayed:true,id:canonical.id});
  for(const message of ['请用一句话解释求职记录为何需要来源，虚构测试。','请用一句话解释材料待确认不等于能力不足，虚构测试。'])expect((await result(await POST(req(randomUUID(),message)))).ok).toBe(true);
  const zero=await db.from('user_quotas').select('free_chat_daily').eq('user_id',owner).single();check(zero);expect(zero.data.free_chat_daily).toBe(0);
  const zeroReplay=await result(await POST(req(rid,ask)));expect(zeroReplay).toMatchObject({ok:true,replayed:true,id:canonical.id});
  const history=await (await GET(new Request(`https://qa.example.invalid/api/coach/agent?sessionId=${sid}`))).json();expect(history.turns.some((t:{id:string})=>t.id===canonical.id)).toBe(true);
  const after=await db.from('ai_generation_events').select('id,status').eq('user_id',owner).eq('status','success');check(after);expect(after.data).toHaveLength(3);
  actor(other);expect((await GET(new Request(`https://qa.example.invalid/api/coach/agent?sessionId=${sid}`))).status).toBe(404);
  console.log(JSON.stringify({live:true,identity:'service test actor, not browser auth',failureRefunded:true,concurrentRequests:10,concurrentSuccessfulModelCalls:1,replayTurnIdStable:true,zeroQuotaReplay:true,historyReadback:true,olderThan20TurnsRetrieved:true,resumeRawLineRead:true,ownerIsolation:true,successfulLiveCalls:3}));
 }finally{
  jest.restoreAllMocks();
  // 仅清理本次随机测试账号及级联记录，不接触旧用户/旧作答。
  for(const id of made)check(await db.from('users').delete().eq('id',id).like('email','harness-%@example.invalid'));
 }
},240000);
