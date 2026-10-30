import { getCurrentUserFromRequest } from "@/lib/auth";
import { POST as draftResume } from "../resume-draft/route";
import { claimResumeTask, finishResumeTask, readResumeTask, ResumeTaskError } from "@/lib/coach-harness/resume-task";
import { countNewResumeChanges, deliveryFromTask, normalizeResumeReason } from "@/lib/coach-harness/resume-delivery";
import { recordResumeServerEvent, recordResumeDocument } from "@/lib/coach-harness/resume-delivery-record";
import { readResumeTrace } from "@/lib/coach-harness/resume-trace";
import type { ResumeAgentTask } from "@/lib/coach-harness/resume-task-types";
import { runResumeConversation } from "@/lib/coach-harness/resume-conversation";
import { resumeConversationStream } from '@/lib/coach-harness/resume-reply-stream';
import { ResumeReferenceError } from '@/lib/opportunities/resume-reference';

export const runtime = "nodejs";
export const maxDuration = 300;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const uuid = /^[0-9a-f-]{36}$/i;
export async function GET(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return reply({ ok: false, error: "未认证" }, 401);
  const id = new URL(request.url).searchParams.get("opportunityId") || "";
  if (!uuid.test(id)) return reply({ ok: false, error: "简历编号无效" }, 400);
  try { return reply({ ok: true, task: await readResumeTask(user.id, id) }); }
  catch (error) { return reply({ ok: false, error: error instanceof Error ? error.message : "读取失败" }, error instanceof ResumeTaskError ? error.status : 503); }
}
export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return reply({ ok: false, error: "未认证" }, 401);
  let claimed: Awaited<ReturnType<typeof claimResumeTask>> | undefined;
  try {
    const body = await request.json();
    if (!uuid.test(body.opportunityId || "")) return reply({ ok: false, error: "简历编号无效" }, 400);
    if(body.action==='message'){
      const execute=async(onReply?:(text:string)=>void,onReceipt?:(task:ResumeAgentTask)=>void)=>{
        try {
          const revise=async(messageId:string)=>{
            claimed=await claimResumeTask(user.id,body.opportunityId,{action:'conversation',messageId});
            if(!claimed.claimed)return claimed.task;
            return executeClaimed(request,body.opportunityId,user.id,claimed);
          };
          return onReply?await runResumeConversation(request,user,body,revise,onReply,onReceipt):await runResumeConversation(request,user,body,revise);
        } catch(error) {
          const message=error instanceof Error?error.message:'改稿暂未完成，补充仍保留';
          if(claimed?.claimed){
            await finishResumeTask(user.id,claimed.task.id,claimed.lease!,claimed.source,{ok:false,error:message}).catch(()=>null);
          }
          const task=await readResumeTask(user.id,body.opportunityId).catch(()=>null);
          const received=task?.conversation?.some(turn=>turn.id===body.requestId);
          return reply({ok:false,error:message,...(task?{task}:{}),messagePersisted:Boolean(received)},error instanceof ResumeTaskError||error instanceof ResumeReferenceError?error.status:503);
        }
      };
      return request.headers.get('accept')?.includes('application/x-ndjson')?resumeConversationStream(execute):await execute();
    }
    if(!['start','restart','answer','skip','retry','revise'].includes(body.action))return reply({ok:false,error:'改稿动作无效'},400);
    claimed = await claimResumeTask(user.id, body.opportunityId, body);
    if (!claimed.claimed) return reply({ ok: true, task: claimed.task, replayed: true });
    return reply({ ok: true, task: await executeClaimed(request,body.opportunityId,user.id,claimed) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "改稿暂未完成，补充仍保留";
    if (claimed?.claimed) {
      await finishResumeTask(user.id, claimed.task.id, claimed.lease!, claimed.source, { ok: false, error: message }).catch(() => null);
    }
    return reply({ ok: false, error: message }, error instanceof ResumeTaskError ? error.status : 503);
  }
}
async function executeClaimed(request:Request,opportunityId:string,userId:string,claimed:Awaited<ReturnType<typeof claimResumeTask>>){
    const generationId = typeof claimed.version === "number" ? `${claimed.task.id}:${claimed.version}` : "";
    const started=Date.now();
    const coordinates={taskId:claimed.task.id,sourceRevision:claimed.source.revision,opportunityId,startedAt:new Date(started).toISOString(),mode:claimed.source.general?'general_resume':'target_resume'};
    if (generationId) await recordResumeServerEvent(userId, "resume_task_started", generationId, deliveryFromTask(null, { generationId, taskState: "running" }),coordinates);
    let result:{ok?:boolean;partial?:boolean;task?:ResumeAgentTask;needUpgrade?:boolean;blocked?:boolean;reasonCode?:string;retryable?:boolean;error?:string;rejectedCount?:number;documentReview?:{status?:string}};
    let evalRunId:string|null=null;
    try {
      const response = await draftResume(new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      opportunityId, resumeText: claimed.source.resume, jobDescription: claimed.source.jd,
      mode: claimed.source.general ? "general_resume" : "target_resume", requestId: `resume-task:${claimed.task.id}:${claimed.version}`,
      resumeTaskId: claimed.task.id, resumeTaskLease: claimed.lease,
      }) }));
      evalRunId=response.headers.get('x-yizhi-eval-id');
      result = await response.json();
    } catch { result={ok:false,reasonCode:'request_failed',retryable:true,error:'修改结果暂未确认，原稿和补充仍保留'}; }
    // The draft route commits before settling quota. If a transport/settlement
    // failure happens after that commit, return the saved generation, not a
    // failed task or a second model run.
    const committed = !result.ok ? await readResumeTask(userId, opportunityId).catch(()=>null) : null;
    const task:ResumeAgentTask=result.task || (committed?.state==='ready'&&committed.result?.resumeGenerationId===generationId?committed:null) || await finishResumeTask(userId, claimed.task.id, claimed.lease!, claimed.source, result).catch(()=>claimed.task);
    // The draft's finally has now flushed its real trace. Re-read the owned
    // task so the receipt and a subsequent refresh expose the same metadata.
    const readback = await readResumeTask(userId,opportunityId).catch(()=>null);
    // Another request may already own a later generation. Never attribute its
    // changes/unchanged flag to this attempt.
    const sameSaved=readback?.result?.resumeGenerationId===generationId&&readback.state==='ready';
    const saved = sameSaved ? readback : task;
    const trace=await readResumeTrace(userId,`resume-task:${claimed.task.id}:${claimed.version}`);
    const failure=trace?.steps.filter(step=>step.stage==='failure').at(-1);
    if (generationId && saved && typeof saved === "object") {
      saved.delivery = deliveryFromTask(saved, {
        generationId,
        persisted: Boolean(sameSaved),
        traceFinishMissing: !sameSaved&&saved.state==='running',
        traceId:trace?.traceId,
        evalRunId,
        stage:failure?trace?.steps.filter(step=>step.stage!=='failure').at(-1)?.stage||'failure':trace?.steps.at(-1)?.stage||null,
        // previousChanges is a transient CAS input removed by the save RPC.
        // The claim's owned snapshot is the actual before-set for this attempt.
        newChangeCount:sameSaved?countNewResumeChanges(claimed.source.changes||[],saved.result?.changes):null,
        hasUnresolved:Boolean(result.partial||saved.result?.partial||result.documentReview?.status==='failed'||result.rejectedCount),
        quotaDenied: !sameSaved&&(result?.needUpgrade === true||trace?.outcome==='quota_denied'),
        blocked: !sameSaved&&(Boolean(result?.blocked) || /发生变化/.test(String(result?.error || ""))),
        reasonCode: normalizeResumeReason(result?.reasonCode||saved.result?.reasonCode) || (/发生变化/.test(String(result?.error || "")) ? "cas_conflict" : result?.ok === false && !sameSaved ? "request_failed" : null),
        retryable: typeof result?.retryable === "boolean" ? result.retryable : null,
      });
      const observed=await recordResumeServerEvent(userId, "resume_task_outcome", generationId, saved.delivery,{...coordinates,elapsedMs:Date.now()-started,changeIds:sameSaved?saved.result?.changes.filter(c=>!claimed.source.changes?.some(p=>p.id===c.id)).map(c=>c.id):[]});
      saved.delivery.observation=observed==='recorded'?'confirmed':'unconfirmed';
      if(sameSaved)await recordResumeDocument(userId,opportunityId,{resumeText:claimed.source.resume,resumeRevision:claimed.source.revision,resumeGenerationId:generationId,resumeChanges:saved.result?.changes}).catch(()=>{});
    }
    return saved;
}
