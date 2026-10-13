import {withAgentRequest} from './agent-request';
import {withMeteredAiRoute} from '@/lib/metered-ai-route';
import {getDbClient} from '@/lib/db';
import {getCurrentUserFromRequest} from '@/lib/auth';
import {readLearningSession} from './learning-memory';
import {reserveQuota,finalizeQuota} from '@/lib/quota';
jest.mock('@/lib/db');jest.mock('@/lib/auth');jest.mock('@/lib/quota');
jest.mock('./learning-memory',()=>({readLearningSession:jest.fn()}));
const input={requestId:'33333333-3333-4333-8333-333333333333',sessionId:'22222222-2222-4222-8222-222222222222',message:'原回答'};
let turn:any=null,claim:any=null;
function fakeDb(){return {from:(table:string)=>{
 const filters:any={};let inserted:any,updated:any;
 const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q;},insert:(r:unknown)=>{inserted=r;return q;},update:(r:unknown)=>{updated=r;return q;},
 single:async()=>{if(claim)return {error:{code:'23505'}};claim={...inserted,status:'processing',lease_expires_at:new Date(Date.now()+180000).toISOString()};return {data:claim};},
 maybeSingle:async()=>{if(table==='coach_agent_turns')return {data:turn};if(updated){if(filters.claim_token!==claim?.claim_token||claim.status!=='processing')return {data:null};Object.assign(claim,updated);}return {data:claim};}};
 return q;
}};}
beforeEach(()=>{jest.resetAllMocks();turn=null;claim=null;(getDbClient as jest.Mock).mockResolvedValue(fakeDb());(getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:'owner'});(readLearningSession as jest.Mock).mockResolvedValue({status:'active'});(reserveQuota as jest.Mock).mockResolvedValue({id:'reservation',source:'tokenpay'});(finalizeQuota as jest.Mock).mockResolvedValue(true);});
test('已有答案免费恢复在实际计费包装之前，零额度仍返回原turn',async()=>{
 turn={id:'turn',question:input.message,answer:'已保存答案',session_id:input.sessionId,opportunity_id:null,learning_trace:{compiledPrompt:'private',outcome:{kind:'saved'}}};
 (reserveQuota as jest.Mock).mockResolvedValue(null);const run=jest.fn();
 const r=await withAgentRequest('owner',input,()=>withMeteredAiRoute(run,{operation:'cockpit_agent',quotaType:'chat'})(new Request('https://example.test')));
 expect(await r.json()).toMatchObject({ok:true,id:'turn',replayed:true});expect(reserveQuota).not.toHaveBeenCalled();expect(run).not.toHaveBeenCalled();
});
test('10同键并发只有一个handler和一次预扣，其余等待同结果',async()=>{
 let release!:()=>void;const waiting=new Promise<void>(r=>{release=r;});
 const handler=jest.fn(async()=>{await waiting;return Response.json({ok:true,answer:'结果',id:'turn'});});
 const metered=withMeteredAiRoute(handler,{operation:'cockpit_agent',quotaType:'chat'});
 const first=withAgentRequest('owner',input,()=>metered(new Request('https://example.test')));
 await new Promise(r=>setImmediate(r));
 const others=await Promise.all(Array.from({length:9},()=>withAgentRequest('owner',input,()=>metered(new Request('https://example.test')))));
 expect(others.every(r=>r.status===202)).toBe(true);expect(handler).toHaveBeenCalledTimes(1);expect(reserveQuota).toHaveBeenCalledTimes(1);
 release();expect((await first).status).toBe(200);expect(claim.status).toBe('completed');
 expect(await (await withAgentRequest('owner',input,handler)).json()).toMatchObject({replayed:true,answer:'结果'});expect(handler).toHaveBeenCalledTimes(1);
});
test('失败已退额度，新request可以继续；同键不暗中重新生成',async()=>{
 const failed=jest.fn(async()=>Response.json({ok:false,error:'上游失败'},{status:502}));
 await withAgentRequest('owner',input,()=>withMeteredAiRoute(failed,{operation:'cockpit_agent',quotaType:'chat'})(new Request('https://example.test')));
 expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);expect(claim.status).toBe('failed');
 expect(await (await withAgentRequest('owner',input,failed)).json()).toMatchObject({ok:false,retryable:true});expect(failed).toHaveBeenCalledTimes(1);
});
test('输入变化409；已过期processing不抢占第二次执行',async()=>{
 await withAgentRequest('owner',input,async()=>Response.json({ok:true}));
 expect((await withAgentRequest('owner',{...input,message:'不同原文'},jest.fn())).status).toBe(409);
 claim.status='processing';claim.lease_expires_at='2000-01-01';const run=jest.fn();
 expect(await (await withAgentRequest('owner',input,run)).json()).toMatchObject({code:'REQUEST_OUTCOME_UNKNOWN',retryable:false});expect(run).not.toHaveBeenCalled();
});
test('历史已存原文/session绑定不同不能回读，私有prompt不外泄',async()=>{
 turn={id:'t',question:input.message,answer:'答案',session_id:input.sessionId,opportunity_id:null,learning_trace:{compiledPrompt:'private'}};
 const r=await withAgentRequest('owner',input,jest.fn());expect((await r.json()).learning_trace.compiledPrompt).toBeUndefined();
 expect((await withAgentRequest('owner',{...input,message:'篡改'},jest.fn())).status).toBe(409);
});
test('已存面试官回复不能伪装成教练回复重放',async()=>{
 turn={id:'t',question:input.message,answer:'问题',session_id:input.sessionId,opportunity_id:null,learning_trace:{interactionMode:'mock_interview'}};
 expect((await withAgentRequest('owner',{...input,interactionMode:'coaching'},jest.fn())).status).toBe(409);
});
