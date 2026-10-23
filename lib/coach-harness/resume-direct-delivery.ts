import {randomUUID} from 'node:crypto';
import {classifyResumeDelivery} from './resume-delivery';
import {recordResumeServerEvent} from './resume-delivery-record';
import {readResumeTrace} from './resume-trace';

/** Direct draft callers get a returned-only receipt, never an invented commit.
 * Task callers are observed after the lease/CAS owner has read back its result. */
export async function observeDirectResume(userId:string,request:Request,execute:(input:Request)=>Promise<Response>):Promise<Response>{
  const body=await request.clone().json().catch(()=>null);
  if(!body||body.resumeTaskId||typeof body.resumeText!=='string'||!body.resumeText.trim())return execute(request);
  const generationId=`direct:${randomUUID()}`,requestId=String(body.requestId||generationId).slice(0,180),started=Date.now();
  const coordinates={startedAt:new Date(started).toISOString(),mode:body.mode==='general_resume'?'general_resume':'target_resume'};
  await recordResumeServerEvent(userId,'resume_task_started',generationId,classifyResumeDelivery({generationId,taskState:'running'}),coordinates);
  try {
    const response=await execute(new Request(request.url,{method:request.method,headers:request.headers,body:JSON.stringify({...body,requestId})}));
    const result=await response.clone().json().catch(()=>null);
    const trace=await readResumeTrace(userId,requestId);
    const receipt=classifyResumeDelivery({generationId,traceId:trace?.traceId,evalRunId:response.headers.get('x-yizhi-eval-id'),
      taskState:result?.ok?'idle':result?.reasonCode==='resume_detail_needed'?'needs_detail':'failed',persisted:false,
      returnedWithoutOpportunity:result?.ok===true,unchanged:result?.unchanged===true,
      newChangeCount:result?.ok&&Array.isArray(result.changes)?result.changes.length:0,
      hasFollowUp:Boolean(result?.followUp||result?.recovery),quotaDenied:trace?.outcome==='quota_denied',blocked:trace?.outcome==='blocked',
      reasonCode:result?.reasonCode||(!result?.ok?'request_failed':'draft_returned_without_opportunity'),stage:trace?.steps.at(-1)?.stage});
    await recordResumeServerEvent(userId,'resume_task_outcome',generationId,receipt,{...coordinates,elapsedMs:Date.now()-started});
    return response;
  } catch(error){
    await recordResumeServerEvent(userId,'resume_task_outcome',generationId,classifyResumeDelivery({generationId,taskState:'failed',persisted:false,reasonCode:'request_failed'}),{...coordinates,elapsedMs:Date.now()-started});
    throw error;
  }
}
