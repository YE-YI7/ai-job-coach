import { getCurrentUserFromRequest } from "@/lib/auth";
import { POST as draftResume } from "../resume-draft/route";
import { claimResumeTask, finishResumeTask, readResumeTask, ResumeTaskError } from "@/lib/coach-harness/resume-task";
import { runResumeConversation } from "@/lib/coach-harness/resume-conversation";
import { resumeConversationStream } from '@/lib/coach-harness/resume-reply-stream';

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
      const execute=async(onReply?:(text:string)=>void)=>{
        try {
          const revise=async(messageId:string)=>{
            claimed=await claimResumeTask(user.id,body.opportunityId,{action:'conversation',messageId});
            if(!claimed.claimed)return claimed.task;
            return executeClaimed(request,body.opportunityId,user.id,claimed);
          };
          return onReply?await runResumeConversation(request,user,body,revise,onReply):await runResumeConversation(request,user,body,revise);
        } catch(error) {
          const message=error instanceof Error?error.message:'改稿暂未完成，补充仍保留';
          if(claimed?.claimed)await finishResumeTask(user.id,claimed.task.id,claimed.lease!,claimed.source,{ok:false,error:message}).catch(()=>undefined);
          return reply({ok:false,error:message},error instanceof ResumeTaskError?error.status:503);
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
    if (claimed?.claimed) await finishResumeTask(user.id, claimed.task.id, claimed.lease!, claimed.source, { ok: false, error: message }).catch(() => undefined);
    return reply({ ok: false, error: message }, error instanceof ResumeTaskError ? error.status : 503);
  }
}
async function executeClaimed(request:Request,opportunityId:string,userId:string,claimed:Awaited<ReturnType<typeof claimResumeTask>>){
    const response = await draftResume(new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      opportunityId, resumeText: claimed.source.resume, jobDescription: claimed.source.jd,
      mode: claimed.source.general ? "general_resume" : "target_resume", requestId: `resume-task:${claimed.task.id}:${claimed.version}`,
      resumeTaskId: claimed.task.id, resumeTaskLease: claimed.lease,
    }) }));
    const result = await response.json();
    // The draft route commits before settling quota. If a transport/settlement
    // failure happens after that commit, return the saved generation, not a
    // failed task or a second model run.
    const committed = !result.ok ? await readResumeTask(userId, opportunityId).catch(()=>null) : null;
    const task=result.task || (committed?.state==='ready'&&committed.result?.resumeGenerationId===`${claimed.task.id}:${claimed.version}`?committed:null) || await finishResumeTask(userId, claimed.task.id, claimed.lease!, claimed.source, result);
    // The draft's finally has now flushed its real trace. Re-read the owned
    // task so the receipt and a subsequent refresh expose the same metadata.
    return await readResumeTask(userId,opportunityId).catch(()=>null) || task;
}
