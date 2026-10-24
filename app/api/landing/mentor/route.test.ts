import {POST} from './route';
import {getDbClient} from '@/lib/db';
import {consumePublicRateLimit} from '@/lib/public-rate-limit';
import {generateLandingPreview} from '@/lib/landing-mentor';
jest.mock('@/lib/db',()=>({getDbClient:jest.fn()}));
jest.mock('@/lib/public-rate-limit',()=>({consumePublicRateLimit:jest.fn()}));
jest.mock('@/lib/landing-mentor',()=>({generateLandingPreview:jest.fn(),
  landingFallback:(text:string)=>({source:'fallback',understanding:`你刚才说：「${text}」`,nextStep:'登录后继续'})}));
const db=getDbClient as jest.Mock,limit=consumePublicRateLimit as jest.Mock,model=generateLandingPreview as jest.Mock;
const id='307a6142-9bb4-4e2d-9157-343b96a393c0';
const initial=process.env.LANDING_MENTOR_PREVIEW_ENABLED;
const request=(body:unknown,origin='https://yizhioffer.com')=>new Request('https://yizhioffer.com/api/landing/mentor',{
  method:'POST',headers:{origin,'Content-Type':'application/json','x-real-ip':'192.0.2.7'},body:JSON.stringify(body)});
beforeEach(()=>{
  jest.clearAllMocks();process.env.LANDING_MENTOR_PREVIEW_ENABLED='1';db.mockResolvedValue({});
  limit.mockResolvedValue({allowed:true});
  model.mockResolvedValue({source:'model',understanding:'会计应届生想转运营',nextStep:'圈出一份运营JD的三项职责'});
});
afterAll(()=>{if(initial===undefined)delete process.env.LANDING_MENTOR_PREVIEW_ENABLED;else process.env.LANDING_MENTOR_PREVIEW_ENABLED=initial;});
test('allows one bounded site response only after durable IP, global and intent budgets',async()=>{
  const result=await POST(request({message:'会计应届生，想转运营',requestId:id}));
  expect(result.status).toBe(200);expect((await result.json()).source).toBe('model');
  expect(limit.mock.calls.map(([x])=>[x.scope,x.limit])).toEqual([
    ['landing-mentor-ip',3],['landing-mentor-global',20],['landing-mentor-once',1]]);
  expect(model).toHaveBeenCalledTimes(1);
  expect(model).toHaveBeenCalledWith('会计应届生，想转运营',id,expect.objectContaining({onUsage:expect.any(Function)}));
  expect(result.headers.get('cache-control')).toContain('no-store');
});
test.each([0,1,2])('budget denial at gate %i preserves the original without a model call',async index=>{
  for(let n=0;n<index;n++)limit.mockResolvedValueOnce({allowed:true});
  limit.mockResolvedValueOnce({allowed:false});
  const body=await (await POST(request({message:'我想先说一句',requestId:id}))).json();
  expect(body.source).toBe('fallback');expect(body.understanding).toContain('我想先说一句');expect(model).not.toHaveBeenCalled();
});
test('disabled rollout, missing DB and failed budget enforcement all fail closed',async()=>{
  process.env.LANDING_MENTOR_PREVIEW_ENABLED='0';await POST(request({message:'虚构输入',requestId:id}));
  expect(db).not.toHaveBeenCalled();
  process.env.LANDING_MENTOR_PREVIEW_ENABLED='1';db.mockResolvedValue(null);await POST(request({message:'虚构输入',requestId:id}));
  expect(model).not.toHaveBeenCalled();db.mockResolvedValue({});limit.mockRejectedValue(new Error('sensitive internal error'));
  expect(JSON.stringify(await (await POST(request({message:'虚构输入',requestId:id}))).json())).not.toContain('sensitive');
});
test('provider failure never retries or echoes credentials/internal details',async()=>{
  model.mockRejectedValue(Error('confirmed_fact secret-key 12000 token'));
  const body=await (await POST(request({message:'虚构输入',requestId:id}))).json();
  expect(body.source).toBe('fallback');expect(JSON.stringify(body)).not.toMatch(/confirmed_fact|secret-key|token/);
  expect(model).toHaveBeenCalledTimes(1);
});
test('rejects foreign origin, injected options and oversized input before touching budget or model',async()=>{
  expect((await POST(request({message:'虚构输入',requestId:id},'https://evil.example'))).status).toBe(403);
  expect((await POST(request({message:'虚构输入',requestId:id,apiKey:'synthetic'}))).status).toBe(400);
  expect((await POST(request({message:'长'.repeat(1001),requestId:id}))).status).toBe(400);
  expect((await POST(request({message:'长'.repeat(3000),requestId:id}))).status).toBe(400);
  expect(limit).not.toHaveBeenCalled();expect(model).not.toHaveBeenCalled();
});
