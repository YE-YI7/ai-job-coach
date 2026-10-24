import {createHash,randomUUID} from 'node:crypto';
import {getDbClient} from '@/lib/db';
import {readLearningSession} from './learning-memory';
import {chatFailureMessage} from './chat-failure';

export interface AgentRequestInput {
  requestId:string; message:string; sessionId?:string|null; opportunityId?:string|null;
  interactionMode?:'coaching'|'mock_interview'; proactive?:boolean;
}
const headers={'Cache-Control':'private, no-store'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
export function agentInputFingerprint(input:AgentRequestInput){
 return createHash('sha256').update(JSON.stringify([input.message,input.sessionId??null,input.opportunityId??null,input.interactionMode??null,input.proactive===true])).digest('hex');
}
function visibleTrace(trace:Record<string,unknown>|null){const {compiledPrompt,compiledSystem,rawModelOutput,...visible}=trace||{};void compiledPrompt;void compiledSystem;void rawModelOutput;return visible;}

/** 必须在预扣之前运行；DB 主键而非进程 Map 保证跨实例只生成一次。 */
export async function withAgentRequest(userId:string,input:AgentRequestInput,run:()=>Promise<Response>):Promise<Response>{
 const db=await getDbClient();if(!db)return reply({ok:false,error:'暂时无法核对回答状态，原文仍保留，请重试',retryable:false},503);
 const existing=await db.from('coach_agent_turns').select('id,question,answer,opportunity_id,session_id,learning_trace').eq('user_id',userId).eq('request_id',input.requestId).maybeSingle();
 if(existing.error)return reply({ok:false,error:'暂时无法核对回答状态，原文仍保留，请重试',retryable:false},503);
 if(existing.data){
  const t=existing.data;
  if(t.question!==input.message||(t.session_id??null)!==(input.sessionId??null)||(t.opportunity_id??null)!==(input.opportunityId??null)||
    (input.interactionMode&&t.learning_trace?.interactionMode&&input.interactionMode!==t.learning_trace.interactionMode))return reply({ok:false,code:'REQUEST_CONFLICT',error:'这次请求已有不同内容，请保留原文后新开一次回答',retryable:false},409);
  const trace=visibleTrace(t.learning_trace);
  return reply({ok:true,replayed:true,id:t.id,answer:t.answer,learning_trace:trace,needsMoreInput:(trace.insufficiency as {needsMoreInput?:boolean})?.needsMoreInput??false,
   blocked:(trace.insufficiency as {blocked?:boolean})?.blocked??false,stageSuggestion:trace.stageSuggestion??null,outcome:trace.outcome??null,outcomeNote:trace.outcomeNote??null});
 }
 if(input.sessionId){const session=await readLearningSession(userId,input.sessionId);if(!session||session.status!=='active')return reply({ok:false,error:'这次辅导已结束或不可访问，请开始新辅导'},409);}
 if(input.opportunityId){const job=await db.from('coach_opportunities').select('id').eq('user_id',userId).eq('id',input.opportunityId).maybeSingle();if(job.error||!job.data)return reply({ok:false,error:'当前工作区不可访问'},job.error?503:404);}
 const fingerprint=agentInputFingerprint(input),token=randomUUID();
 const claimed=await db.from('coach_agent_requests').insert({user_id:userId,request_id:input.requestId,session_id:input.sessionId??null,opportunity_id:input.opportunityId??null,input_fingerprint:fingerprint,claim_token:token}).select('claim_token').single();
 if(claimed.error){
  if(claimed.error.code!=='23505')return reply({ok:false,error:'回答状态暂未建立，未开始生成，请重试',retryable:false},503);
  const current=await db.from('coach_agent_requests').select('input_fingerprint,status,result,lease_expires_at').eq('user_id',userId).eq('request_id',input.requestId).maybeSingle();
  if(current.error||!current.data)return reply({ok:false,error:'暂时无法核对回答状态，请稍后继续',retryable:false},503);
  if(current.data.input_fingerprint!==fingerprint)return reply({ok:false,code:'REQUEST_CONFLICT',error:'请求内容已变化，不能重用上次请求',retryable:false},409);
  if(current.data.status==='completed')return reply({...current.data.result,replayed:true});
  if(current.data.status==='failed')return reply({...current.data.result,ok:false,retryable:true},502);
  // 超时不自动抢新 lease：旧上游是否计费/写完仍未知，不能偷偷启动第二次。
  const expired=Date.parse(current.data.lease_expires_at)<Date.now();
  return reply({ok:false,code:expired?'REQUEST_OUTCOME_UNKNOWN':'REQUEST_PROCESSING',retryable:false,error:expired?'上一轮结果仍待核对，原回答已保留。请稍后继续或联系支持，不会自动重复生成。':'上一轮回答仍在处理，原文已保留。稍后点继续即可，不会重复生成。'},202);
 }
 const finish=async(status:'completed'|'failed',result:unknown)=>{
  const saved=await db.from('coach_agent_requests').update({status,result,updated_at:new Date().toISOString()}).eq('user_id',userId).eq('request_id',input.requestId).eq('claim_token',token).eq('status','processing').select('request_id').maybeSingle();
  if(saved.error||!saved.data)throw Error('回答状态尚未确认，请检查历史后继续');
 };
 try{
  const response=await run(),body=await response.clone().json();
  await finish(body.ok?'completed':'failed',body);
  return response;
 }catch(error){
  const body={ok:false,error:chatFailureMessage(error)};
  await finish('failed',body).catch(()=>undefined);
  throw error;
 }
}
