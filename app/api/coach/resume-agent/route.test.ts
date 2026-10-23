import { GET, POST } from './route';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { POST as draft } from '../resume-draft/route';
import { claimResumeTask, finishResumeTask, readResumeTask, ResumeTaskError } from '@/lib/coach-harness/resume-task';
import { runResumeConversation } from '@/lib/coach-harness/resume-conversation';
import {recordResumeServerEvent,recordResumeDocument} from '@/lib/coach-harness/resume-delivery-record';
import {readResumeTrace} from '@/lib/coach-harness/resume-trace';
jest.mock('@/lib/auth');
jest.mock('@/lib/coach-harness/resume-trace',()=>({readResumeTrace:jest.fn().mockResolvedValue(null)}));
jest.mock('@/lib/coach-harness/resume-delivery-record',()=>({recordResumeServerEvent:jest.fn().mockResolvedValue('recorded'),recordResumeDocument:jest.fn().mockResolvedValue(undefined)}));
jest.mock('@/lib/coach-harness/resume-conversation',()=>({runResumeConversation:jest.fn()}));
jest.mock('../resume-draft/route',()=>({POST:jest.fn()}));
jest.mock('@/lib/coach-harness/resume-task',()=>({claimResumeTask:jest.fn(),finishResumeTask:jest.fn(),readResumeTask:jest.fn(),ResumeTaskError:class extends Error{constructor(message:string,public status=409){super(message);}}}));
const id='12345678-1234-4234-9234-123456789abc';
const request=(body:unknown,stream=false)=>new Request('https://example.com/api/coach/resume-agent',{method:'POST',headers:stream?{accept:'application/x-ndjson'}:{},body:JSON.stringify(body)});
beforeEach(()=>{jest.resetAllMocks();(getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:'owner'});(readResumeTask as jest.Mock).mockResolvedValue(null);(readResumeTrace as jest.Mock).mockResolvedValue(null);(recordResumeServerEvent as jest.Mock).mockResolvedValue('recorded');(recordResumeDocument as jest.Mock).mockResolvedValue(undefined);});
test('unauthenticated and invalid actions never claim a task',async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValueOnce(null);
  expect((await POST(request({opportunityId:id,action:'start'}))).status).toBe(401);
  expect((await POST(request({opportunityId:id,action:'anything'}))).status).toBe(400);
  expect(claimResumeTask).not.toHaveBeenCalled();
});
test('message dispatch goes to mentor without automatically claiming an edit',async()=>{
  (runResumeConversation as jest.Mock).mockResolvedValue(Response.json({ok:true,conversationDecision:'discuss',task:{state:'ready'}}));
  const body={opportunityId:id,action:'message',requestId:id,answer:'为什么这样写，先别改'};
  expect(await (await POST(request(body))).json()).toMatchObject({conversationDecision:'discuss'});
  expect(runResumeConversation).toHaveBeenCalledWith(expect.any(Request),{id:'owner'},body,expect.any(Function));
  expect(claimResumeTask).not.toHaveBeenCalled();expect(draft).not.toHaveBeenCalled();
});
test('real route emits only mentor text before completion, retaining authenticated same request path',async()=>{
 let finish!:(response:Response)=>void;
 (runResumeConversation as jest.Mock).mockImplementation(async(_request,_user,_body,_revise,onReply)=>{onReply('**先讨论**\n\n已有材料。');return new Promise<Response>(resolve=>finish=resolve);});
 const response=await POST(request({opportunityId:id,action:'message',requestId:id,answer:'先讨论'},true));
 expect(response.headers.get('content-type')).toContain('application/x-ndjson');
 const reader=response.body!.getReader(),decoder=new TextDecoder();
 await reader.read();expect(decoder.decode((await reader.read()).value)).toContain('replace');
 expect(claimResumeTask).not.toHaveBeenCalled();expect(draft).not.toHaveBeenCalled();
 finish(Response.json({ok:true,task:{state:'ready'},conversationDecision:'discuss'}));
 expect(decoder.decode((await reader.read()).value)).toContain('"type":"done"');await reader.cancel();
 expect(runResumeConversation).toHaveBeenCalledTimes(1);
});
test('only the mentor callback can claim and finish the normal editor',async()=>{
  (runResumeConversation as jest.Mock).mockImplementation(async(_request,_user,body,revise)=>Response.json({ok:true,task:await revise(body.requestId)}));
  const source={resume:'已保存的原文',jd:'',general:true,revision:'rev'};
  (claimResumeTask as jest.Mock).mockResolvedValue({claimed:true,task:{id:'task'},version:3,lease:'lease',source});
  (draft as jest.Mock).mockResolvedValue(Response.json({ok:true,changes:[]}));
  (finishResumeTask as jest.Mock).mockResolvedValue({id:'task',state:'ready'});
  expect((await POST(request({opportunityId:id,action:'message',requestId:id,answer:'请精简'}))).status).toBe(200);
  expect(claimResumeTask).toHaveBeenCalledWith('owner',id,{action:'conversation',messageId:id});
  expect(draft).toHaveBeenCalledTimes(1);expect(finishResumeTask).toHaveBeenCalledTimes(1);
});
test('owned authoritative source is used, not client-supplied résumé or JD',async()=>{
  const source={resume:'已保存的真实原文',jd:'',general:true,revision:'rev'};
  (claimResumeTask as jest.Mock).mockResolvedValue({claimed:true,task:{id:'task'},version:3,lease:'lease',source});
  (draft as jest.Mock).mockResolvedValue(Response.json({ok:true,changes:[]}));
  (finishResumeTask as jest.Mock).mockResolvedValue({id:'task',state:'ready'});
  expect((await POST(request({opportunityId:id,action:'start',resumeText:'伪造经历',jobDescription:'伪造 JD'}))).status).toBe(200);
  const input=await (draft as jest.Mock).mock.calls[0][0].json();
  expect(input).toMatchObject({resumeText:source.resume,jobDescription:'',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'});
  expect(finishResumeTask).toHaveBeenCalledWith('owner','task','lease',source,{ok:true,changes:[]});
});
test('refresh and already-running requests do not invoke another model',async()=>{
  (readResumeTask as jest.Mock).mockResolvedValue({state:'needs_detail',question:{question:'你具体交付了什么？'}});
  expect((await GET(new Request(`https://example.com/api/coach/resume-agent?opportunityId=${id}`))).headers.get('cache-control')).toBe('private, no-store');
  (claimResumeTask as jest.Mock).mockResolvedValue({claimed:false,task:{state:'running'}});
  expect(await (await POST(request({opportunityId:id,action:'start'}))).json()).toMatchObject({replayed:true,task:{state:'running'}});
  expect(draft).not.toHaveBeenCalled();
});
test('a real upstream failure is finalized, with saved answers left intact',async()=>{
  (claimResumeTask as jest.Mock).mockResolvedValue({claimed:true,task:{id:'task'},lease:'lease',source:{resume:'原文',jd:'',general:true}});
  (draft as jest.Mock).mockRejectedValue(Error('model timeout'));
  (finishResumeTask as jest.Mock).mockResolvedValue({state:'failed'});
  const response=await POST(request({opportunityId:id,action:'retry'}));
  expect(await response.json()).toMatchObject({task:{state:'failed'}});
  expect(finishResumeTask).toHaveBeenCalledTimes(1);
  expect(finishResumeTask).toHaveBeenCalledWith('owner','task','lease',expect.anything(),expect.objectContaining({ok:false,reasonCode:'request_failed'}));
});
test('owner failure does not call model or finish someone else’s task',async()=>{
  (claimResumeTask as jest.Mock).mockRejectedValue(new ResumeTaskError('当前简历不可访问',404));
  expect((await POST(request({opportunityId:id,action:'answer'}))).status).toBe(404);
  expect(draft).not.toHaveBeenCalled();expect(finishResumeTask).not.toHaveBeenCalled();
});
test('a committed result survives a later response failure without double finishing',async()=>{
  (claimResumeTask as jest.Mock).mockResolvedValue({claimed:true,task:{id:'task'},version:4,lease:'lease',source:{resume:'原文',jd:''}});
  (draft as jest.Mock).mockResolvedValue(Response.json({ok:false,error:'response failed'},{status:503}));
  (readResumeTask as jest.Mock).mockResolvedValue({id:'task',state:'ready',result:{resumeGenerationId:'task:4',changes:[]}});
  expect(await (await POST(request({opportunityId:id,action:'retry'}))).json()).toMatchObject({ok:true,task:{state:'ready'}});
  expect(finishResumeTask).not.toHaveBeenCalled();
});
test('later editor failure returns the saved mentor conversation, not an unsent message',async()=>{
 const task={id:'task',state:'failed',conversation:[{id,message:'交付了方案',reply:'补充已收到',status:'completed',decision:'revise'}]};
 (runResumeConversation as jest.Mock).mockImplementation(async(_request,_user,_body,revise)=>{await revise(id);throw Error('later editor failure');});
 (claimResumeTask as jest.Mock).mockResolvedValue({claimed:true,task:{id:'task'},version:4,lease:'lease',source:{resume:'原文',jd:''}});
 (draft as jest.Mock).mockRejectedValue(Error('model timeout'));
 (readResumeTask as jest.Mock).mockResolvedValue(task);
 (finishResumeTask as jest.Mock).mockResolvedValue(task);
 const response=await POST(request({opportunityId:id,action:'message',requestId:id,answer:'交付了方案'}));
 expect(response.status).toBe(503);
 expect(await response.json()).toMatchObject({ok:false,messagePersisted:true,task});
});
test('counts new changes from the claimed source, not the transient CAS field removed by the RPC',async()=>{
 const generation='task:4',saved={id:'task',state:'ready',result:{resumeGenerationId:generation,changes:[{id:'retained'},{id:'new-change'}]}};
 (claimResumeTask as jest.Mock).mockResolvedValue({claimed:true,task:{id:'task'},version:4,lease:'lease',source:{resume:'原文',jd:'',revision:'rev',changes:[{id:'retained'}]}});
 (draft as jest.Mock).mockResolvedValue(Response.json({ok:true,task:saved}));
 (readResumeTask as jest.Mock).mockResolvedValue(saved);
 expect(await(await POST(request({opportunityId:id,action:'start'}))).json()).toMatchObject({task:{delivery:{outcome:'delivered',deliveredCount:1}}});
 expect(recordResumeServerEvent).toHaveBeenLastCalledWith('owner','resume_task_outcome',generation,expect.objectContaining({outcome:'delivered'}),expect.objectContaining({changeIds:['new-change']}));
});
