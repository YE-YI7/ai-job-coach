import { randomUUID } from "node:crypto";
import { withMeteredAiRoute } from "@/lib/metered-ai-route";
import { runWithGenerationContext } from "@/lib/generation-context";
import { observedResumeLLM } from "./eval-observer";
import { captureEvalStage } from "./eval-scope";
import { recordWorkspaceResume } from "./workspace-eval";
import { beginResumeMessage, completeResumeMessage, failResumeMessage } from "./resume-task";
import { parseResumeConversationDecision, resumeConversationMessages } from "./resume-conversation-decision";
import type { ResumeAgentTask } from "./resume-task-types";

const reply=(body:unknown)=>Response.json(body,{headers:{'Cache-Control':'private, no-store'}});
/** Sending invokes the mentor. Only its validated decision may invoke the editor. */
export async function runResumeConversation(request:Request,user:{id:string},body:{opportunityId:string;requestId:string;answer:string},revise:(messageId:string)=>Promise<ResumeAgentTask>){
  const opened=await beginResumeMessage(user.id,body.opportunityId,body.requestId,String(body.answer||''));
  if(opened.replayed)return reply({ok:true,task:opened.needsRevision?await revise(body.requestId):opened.task,replayed:true});
  const auditRequest=new Request(request.url,{method:'POST',headers:{...Object.fromEntries(request.headers),'Content-Type':'application/json','x-idempotency-key':`${body.requestId}-${opened.version}`},body:JSON.stringify({
    resumeText:opened.source.resume,jobDescription:opened.source.jd,mode:opened.source.general?'general_resume':'target_resume',
    requestId:`resume-conversation:${body.requestId}:${opened.version}`,evalCaptureId:randomUUID(),evalLabel:'简历导师 · 讨论与执行决策',
  })});
  try{
    const execute=withMeteredAiRoute(async()=>{
      const start=Date.now(),{messages,knowledge}=resumeConversationMessages(opened.source,opened.task);
      captureEvalStage('context','resume_conversation_context',{input:{messageId:body.requestId,message:body.answer},output:{currentTask:opened.task,source:opened.source},knowledge:knowledge.map(k=>({id:k.id,title:k.title,included:true,kind:'knowledge'}))},start,Date.now()-start);
      const raw=await runWithGenerationContext({userId:user.id,operation:'resume_conversation',requestId:`${body.requestId}:decision`,knowledgeDocumentIds:knowledge.map(k=>k.id)},()=>observedResumeLLM(messages,{provider:'deepseek',temperature:0,maxTokens:1400,reasoningBudgetTokens:2048,timeoutMs:45_000,maxRetries:0,responseFormat:'json_object'}));
      const plan=parseResumeConversationDecision(raw,opened.source.resume,opened.task.conversation||[]);
      const task=await completeResumeMessage(user.id,body.opportunityId,body.requestId,opened.version,plan);
      captureEvalStage('review','resume_conversation_decision',{input:{messageId:body.requestId},output:plan},start,Date.now()-start);
      return reply({ok:true,task:plan.action==='revise'?await revise(body.requestId):task,conversationDecision:plan.action});
    },{operation:'resume_conversation',quotaType:'chat'});
    const response=await recordWorkspaceResume(user,auditRequest,execute);
    if(!response.ok)await failResumeMessage(user.id,body.opportunityId,body.requestId,opened.version);
    return response;
  }catch(error){
    await failResumeMessage(user.id,body.opportunityId,body.requestId,opened.version).catch(()=>undefined);
    throw error;
  }
}
