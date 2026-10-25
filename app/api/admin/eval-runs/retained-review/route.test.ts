import { POST } from './route';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDbClient } from '@/lib/db';
import { hasActiveTokenPayConnection } from '@/lib/tokenpay';
import { observedResumeLLM } from '@/lib/coach-harness/eval-observer';
import { retainedResumeEvalInput } from '@/lib/coach-harness/resume-retained-eval';
jest.mock('@/lib/auth',()=>({getCurrentUserFromRequest:jest.fn()}));
jest.mock('@/lib/db',()=>({getDbClient:jest.fn()}));
jest.mock('@/lib/tokenpay',()=>({hasActiveTokenPayConnection:jest.fn()}));
jest.mock('@/lib/coach-harness/resume-retained-eval',()=>({retainedResumeEvalInput:jest.fn()}));
jest.mock('@/lib/coach-harness/eval-observer',()=>({observedResumeLLM:jest.fn(),redactEval:(x:unknown)=>x,
  withEvalObserver:(_:unknown,fn:()=>unknown)=>fn()}));
const origin='https://example.invalid',body={sourceRunId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',retainedChangeIds:['c-1'],acknowledgeCost:true};
const make=(value:unknown,site=origin)=>new Request(origin+'/api/admin/eval-runs/retained-review',{
  method:'POST',headers:{origin:site},body:JSON.stringify(value)});
const before='- **清单交付。** 收集反馈，收集后汇总问题清单，交给同事讨论。';
const change={id:'c-1',before,after:'- **清单交付。** 汇总反馈形成问题清单，交给同事讨论。',status:'pending',evidenceIds:['s1']};
const plan={mainline:'通过反馈清单交付证明需求整理能力',claims:[{point:'将反馈整理成清单交给同事',sourceIds:['s1']}],
  priorities:[{id:'p1',before,goal:'删除重复收集过程，突出清单与用途'}]};
let oldEmails:string|undefined;
beforeAll(()=>{oldEmails=process.env.ADMIN_EMAILS;});
afterAll(()=>{if(oldEmails===undefined)delete process.env.ADMIN_EMAILS;else process.env.ADMIN_EMAILS=oldEmails;});
beforeEach(()=>{
  jest.clearAllMocks();process.env.ADMIN_EMAILS='owner@example.invalid';
  jest.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-25T11:00:00Z'));
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:'admin',email:'owner@example.invalid'});
  (hasActiveTokenPayConnection as jest.Mock).mockResolvedValue(true);
  (retainedResumeEvalInput as jest.Mock).mockReturnValue({original:before,preview:change.after,jd:'',facts:'s1',plan,changes:[change]});
});
afterEach(()=>jest.restoreAllMocks());
test('the support window expires without retaining a permanent model billing path',async()=>{
  jest.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-26T00:00:00Z'));
  expect((await POST(make(body))).status).toBe(410);
  expect(getDbClient).not.toHaveBeenCalled();expect(observedResumeLLM).not.toHaveBeenCalled();
});
test('authentication, CSRF and arbitrary text injection stop before database or billing',async()=>{
  expect((await POST(make(body,'https://evil.invalid'))).status).toBe(403);
  expect((await POST(make({...body,resumeText:'inject new material'}))).status).toBe(400);
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);expect((await POST(make(body))).status).toBe(401);
  expect(getDbClient).not.toHaveBeenCalled();expect(observedResumeLLM).not.toHaveBeenCalled();
});
test('same parent has one durable probe and cannot be replayed with a different subset',async()=>{
  const eq=jest.fn().mockReturnThis();
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>({select:()=>({eq,maybeSingle:async()=>({data:{run:{}},error:null})}),
    insert:async()=>({error:{code:'23505'}})})});
  expect((await POST(make(body))).status).toBe(202);expect(observedResumeLLM).not.toHaveBeenCalled();
  expect(eq).toHaveBeenCalledWith('user_id','admin');
});
test('exactly one reviewed call, no editor, no quota, and contradictory negative verdict never becomes success',async()=>{
  const write={eq:jest.fn().mockReturnThis(),then:(resolve:(x:unknown)=>unknown)=>resolve({error:null})};
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>({select:()=>({eq:jest.fn().mockReturnThis(),
    maybeSingle:async()=>({data:{run:{}},error:null})}),insert:async()=>({error:null}),update:()=>write})});
  (observedResumeLLM as jest.Mock).mockResolvedValue(JSON.stringify({status:'failed',summary:'保留稿仍有无价值的改写',
    findings:[{changeId:'c-1',severity:'error',message:'本轮目标未真正完成'}],
    valueChecks:[{index:0,useful:false,kind:'none',impact:'correction',reason:'仍未改善信息取舍不能判为完成'}],
    document:{status:'passed',summary:'未新增事实但本轮内容价值不足',findings:[]},
    narrativeReview:{status:'failed',mainlineSupported:true,summary:'主线可成立但目标尚未完成',
      goals:[{id:'p1',status:'not_addressed',reason:'本轮目标未真正完成，需要原编辑返修'}]},recovery:null}));
  const response=await POST(make(body));expect(await response.json()).toMatchObject({status:'blocked'});
  expect(observedResumeLLM).toHaveBeenCalledTimes(1);expect(observedResumeLLM).toHaveBeenCalledWith(expect.any(Array),
    expect.objectContaining({maxRetries:0,timeoutMs:55000}));
});
