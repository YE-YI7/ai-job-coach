import { randomUUID } from "node:crypto";
import { withMeteredAiRoute } from "@/lib/metered-ai-route";
import { runWithGenerationContext } from "@/lib/generation-context";
import { observedResumeLLM } from "./eval-observer";
import { captureEvalStage } from "./eval-scope";
import { recordWorkspaceResume, workspaceEvalEnabled } from "./workspace-eval";
import { beginResumeMessage, completeResumeMessage, failResumeMessage, readResumeTask, ResumeTaskError } from "./resume-task";
import { resumeMessageFailure } from './resume-conversation-recovery';
import { resumeConversationLlmOptions } from './resume-conversation-model';
import {
  parseResumeConversationDecision, resumeConversationMessages, ResumeConversationEvidenceError,
  type ResumeConversationDecision,
} from "./resume-conversation-decision";
import type { ResumeAgentTask } from "./resume-task-types";
import { resumeReplyPreview } from './resume-reply-stream';
import {isChatMode} from './chat-options';
import {resolveChatModel} from './chat-models';
import { ResumeReferenceError } from '@/lib/opportunities/resume-reference';

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
/** Sending invokes the mentor. Only its validated decision may invoke the editor. */
export async function runResumeConversation(
  request:Request,user:{id:string},body:{opportunityId:string;requestId:string;answer:string;modelMode?:unknown;resumeReference?:unknown},
  revise:(messageId:string)=>Promise<ResumeAgentTask>,onReply?:(text:string)=>void,onReceipt?:(task:ResumeAgentTask)=>void,
){
  const mode=body.modelMode;
  if(mode!==undefined&&!isChatMode(mode))throw new ResumeTaskError('模型选项无效',400);
  const opened=await beginResumeMessage(user.id,body.opportunityId,body.requestId,String(body.answer||''),body.resumeReference);
  onReceipt?.(opened.task);
  if(opened.replayed)return reply({ok:true,task:opened.needsRevision?await revise(body.requestId):opened.task,replayed:true});
  const traceId=randomUUID();
  const auditRequest=new Request(request.url,{method:'POST',headers:{...Object.fromEntries(request.headers),'Content-Type':'application/json','x-idempotency-key':`${body.requestId}-${opened.version}`},body:JSON.stringify({
    resumeText:opened.source.resume,jobDescription:opened.source.jd,mode:opened.source.general?'general_resume':'target_resume',
    requestId:`resume-conversation:${body.requestId}:${opened.version}`,evalCaptureId:traceId,evalLabel:'简历导师 · 讨论与执行决策',
  })});
  try{
    const execute=withMeteredAiRoute(async()=>{
      const start=Date.now(),{messages,knowledge}=resumeConversationMessages(opened.source,opened.task);
      captureEvalStage('context','resume_conversation_context',{input:{messageId:body.requestId,message:body.answer},output:{currentTask:opened.task,source:opened.source},knowledge:knowledge.map(k=>({id:k.id,title:k.title,included:true,kind:'knowledge'}))},start,Date.now()-start);
      const options=resumeConversationLlmOptions();
      // 自动仍沿用原专用默认；只有明确选择才路由，不暗中升档或影响改稿/质检。
      if(mode&&mode!=='auto')options.model=(await resolveChatModel(user.id,mode,body.answer)).model;
      // Discussion stays progressive. An editor promise is displayed only after
      // its target/evidence has been validated, so invalid placement cannot
      // stream a false "I'll add this experience" then retract the whole reply.
      if(onReply)options.onDelta=resumeReplyPreview(onReply,false);
      const raw=await runWithGenerationContext({userId:user.id,operation:'resume_conversation',requestId:`${body.requestId}:decision`,knowledgeDocumentIds:knowledge.map(k=>k.id)},()=>observedResumeLLM(messages,options));
      let plan: ResumeConversationDecision;
      let evidenceNotApplied=false;
      try {
        plan=parseResumeConversationDecision(raw,opened.source.resume,opened.task.conversation||[]);
      } catch (error) {
        if (!(error instanceof ResumeConversationEvidenceError)) throw error;
        evidenceNotApplied=true;
        captureEvalStage('review','resume_conversation_evidence_not_applied',{
          input:{messageId:body.requestId},
          output:{reason:error.message,action:'discuss',editorInvoked:false},
        },start,Date.now()-start);
        // Never dispatch an untrusted editorBrief or stream its edit promise.
        // The original user message stays available on the completed turn.
        plan={action:'discuss',reply:'这条补充已保存。本轮没有执行新修改，原稿和已有改稿都保留；无法核对的内容暂不写入简历。',
          editorBrief:'',supplement:null};
      }
      const task=await completeResumeMessage(user.id,body.opportunityId,body.requestId,opened.version,plan);
      onReply?.(plan.reply);
      onReceipt?.(task);
      captureEvalStage('review','resume_conversation_decision',{input:{messageId:body.requestId},output:plan},start,Date.now()-start);
      if(evidenceNotApplied){
        // The user receipt is saved, but this was not a useful model decision.
        // Preserve the existing failed-call refund inside the metered boundary;
        // expose the saved non-editing receipt only AFTER settlement below.
        return reply({ok:true,task,conversationDecision:'discuss',conversationRecovery:'evidence_not_applied'},422);
      }
      return reply({ok:true,task:plan.action==='revise'?await revise(body.requestId):task,conversationDecision:plan.action});
    },{operation:'resume_conversation',quotaType:'chat'});
    const response=await recordWorkspaceResume(user,auditRequest,execute);
    if(!response.ok){
      const problem=await response.clone().json().catch(()=>({}));
      if(response.status===422&&problem.conversationRecovery==='evidence_not_applied'
        &&problem.task?.conversation?.some((turn:{id:string;status:string;decision?:string})=>
          turn.id===body.requestId&&turn.status==='completed'&&turn.decision==='discuss')){
        return Response.json(problem,{status:200,headers:response.headers});
      }
      await failResumeMessage(user.id,body.opportunityId,body.requestId,opened.version,{...resumeMessageFailure(problem.error),...(workspaceEvalEnabled(user)?{traceId}:{})});
      const task=await readResumeTask(user.id,body.opportunityId).catch(()=>null);
      return Response.json({...problem,task},{status:response.status,headers:response.headers});
    }
    return response;
  }catch(error){
    const failure={...resumeMessageFailure(error),...(error instanceof ResumeReferenceError?{message:error.message}:{}),
      ...(workspaceEvalEnabled(user)?{traceId}:{})};
    await failResumeMessage(user.id,body.opportunityId,body.requestId,opened.version,failure).catch(()=>undefined);
    const task=await readResumeTask(user.id,body.opportunityId).catch(()=>null);
    // The mentor receipt can already be committed when a later editor/settlement
    // fails. Let the route finish its editor lease; never relabel/re-run the mentor.
    if(task?.conversation?.some(turn=>turn.id===body.requestId&&turn.status==='completed'))throw error;
    const known=error instanceof ResumeTaskError||error instanceof ResumeReferenceError;
    return Response.json({ok:false,error:known?error.message:failure.message,task},{status:known?error.status:503,headers:{'Cache-Control':'private, no-store'}});
  }
}
