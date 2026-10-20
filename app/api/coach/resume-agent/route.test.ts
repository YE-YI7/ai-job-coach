import { GET, POST } from './route';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { POST as draft } from '../resume-draft/route';
import { claimResumeTask, finishResumeTask, readResumeTask, ResumeTaskError } from '@/lib/coach-harness/resume-task';
jest.mock('@/lib/auth');
jest.mock('@/lib/coach-harness/resume-conversation',()=>({runResumeConversation:jest.fn()}));
jest.mock('../resume-draft/route',()=>({POST:jest.fn()}));
jest.mock('@/lib/coach-harness/resume-task',()=>({claimResumeTask:jest.fn(),finishResumeTask:jest.fn(),readResumeTask:jest.fn(),ResumeTaskError:class extends Error{constructor(message:string,public status=409){super(message);}}}));
const id='12345678-1234-4234-9234-123456789abc';
const request=(body:unknown)=>new Request('https://example.com/api/coach/resume-agent',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{jest.resetAllMocks();(getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:'owner'});});
test('unauthenticated and invalid actions never claim a task',async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValueOnce(null);
  expect((await POST(request({opportunityId:id,action:'start'}))).status).toBe(401);
  expect((await POST(request({opportunityId:id,action:'anything'}))).status).toBe(400);
  expect(claimResumeTask).not.toHaveBeenCalled();
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
  expect((await POST(request({opportunityId:id,action:'retry'}))).status).toBe(503);
  expect(finishResumeTask).toHaveBeenCalledWith('owner','task','lease',expect.anything(),{ok:false,error:'model timeout'});
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
