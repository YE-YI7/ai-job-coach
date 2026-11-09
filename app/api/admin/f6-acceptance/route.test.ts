import {GET,POST} from './route';
import {evalAdminAccess} from '@/lib/coach-harness/eval-admin-http';
import {claimF6Acceptance,F6_ACCEPTANCE_ID} from '@/lib/coach-harness/f6-acceptance';
import {runResumeDraft} from '@/lib/coach-harness/resume-execution';
jest.mock('@/lib/coach-harness/eval-admin-http',()=>({evalAdminAccess:jest.fn(),
  evalJson:(body:unknown,status=200)=>Response.json(body,{status})}));
jest.mock('@/lib/coach-harness/f6-acceptance',()=>({F6_ACCEPTANCE_ID:'fixed-id',claimF6Acceptance:jest.fn()}));
jest.mock('@/lib/coach-harness/resume-execution',()=>({runResumeDraft:jest.fn()}));
const request=(body:unknown={id:F6_ACCEPTANCE_ID},origin='https://example.com')=>new Request('https://example.com/api/admin/f6-acceptance',{
  method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{jest.clearAllMocks();(evalAdminAccess as jest.Mock).mockResolvedValue({user:{id:'owner'},error:null});});
test('anonymous and non-admin requests do not acquire a run or a budget',async()=>{
  (evalAdminAccess as jest.Mock).mockResolvedValue({error:Response.json({error:'unauth'},{status:401})});
  expect((await GET(new Request('https://example.com/api/admin/f6-acceptance'))).status).toBe(401);
  expect((await POST(request())).status).toBe(401);
  expect(claimF6Acceptance).not.toHaveBeenCalled();expect(runResumeDraft).not.toHaveBeenCalled();
});
test('cross-origin, injected model and another run cannot spend',async()=>{
  expect((await POST(request(undefined,'https://evil.invalid'))).status).toBe(403);
  expect((await POST(request({id:F6_ACCEPTANCE_ID,model:'other'}))).status).toBe(400);
  expect((await POST(request({id:'another-id'}))).status).toBe(400);
  expect(claimF6Acceptance).not.toHaveBeenCalled();
});
test('real server execution gets only the claimed frozen request and server-funded scope',async()=>{
  const execution={context:{},model:'deepseek-v4-flash'},save=jest.fn();
  (claimF6Acceptance as jest.Mock).mockResolvedValue({run:{request:{resumeText:'frozen',opportunityId:'clone'}},execution,spans:[],save});
  (runResumeDraft as jest.Mock).mockResolvedValue(Response.json({ok:true,task:{state:'ready'}}));
  const response=await POST(request());expect(response.status).toBe(200);
  expect(runResumeDraft).toHaveBeenCalledWith(expect.any(Request),{id:'owner'},expect.objectContaining({acceptance:execution,reviewPolicy:'on_demand'}));
  expect(await (runResumeDraft as jest.Mock).mock.calls[0][0].json()).toEqual({resumeText:'frozen',opportunityId:'clone'});
  expect(save).toHaveBeenCalled();
});
test('native same-origin form is accepted, but cross-origin form still cannot claim or spend',async()=>{
  const form=(origin:string)=>new Request('https://example.com/api/admin/f6-acceptance',{
    method:'POST',headers:{origin,'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({id:F6_ACCEPTANCE_ID})});
  expect((await POST(form('https://evil.invalid'))).status).toBe(403);
  expect(claimF6Acceptance).not.toHaveBeenCalled();
  (claimF6Acceptance as jest.Mock).mockRejectedValue(new Error('PREPARED_TEST_STOP_NO_MODEL'));
  expect((await POST(form('https://example.com'))).status).toBe(409);
  expect(claimF6Acceptance).toHaveBeenCalledTimes(1);expect(runResumeDraft).not.toHaveBeenCalled();
});
