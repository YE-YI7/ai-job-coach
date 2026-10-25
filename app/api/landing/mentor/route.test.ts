import {POST} from './route';
import {consumeLandingPreviewBudget} from '@/lib/landing-preview-budget';
import {generateLandingPreview} from '@/lib/landing-mentor';
jest.mock('@/lib/landing-preview-budget',()=>({consumeLandingPreviewBudget:jest.fn()}));
jest.mock('@/lib/landing-mentor',()=>({generateLandingPreview:jest.fn(),
  landingFallback:(text:string)=>({source:'fallback',understanding:`你刚才说：「${text}」`,nextStep:'登录后继续'})}));
const limit=consumeLandingPreviewBudget as jest.Mock,model=generateLandingPreview as jest.Mock;
const id='307a6142-9bb4-4e2d-9157-343b96a393c0';
const initial=process.env.LANDING_MENTOR_PREVIEW_ENABLED;
const request=(body:unknown,origin='https://yizhioffer.com')=>new Request('https://yizhioffer.com/api/landing/mentor',{
  method:'POST',headers:{origin,'Content-Type':'application/json','x-real-ip':'192.0.2.7'},body:JSON.stringify(body)});
beforeEach(()=>{
  jest.clearAllMocks();process.env.LANDING_MENTOR_PREVIEW_ENABLED='1';
  limit.mockResolvedValue({allowed:true});
  model.mockResolvedValue({source:'model',understanding:'会计应届生想转运营',nextStep:'圈出一份运营JD的三项职责'});
});
afterAll(()=>{if(initial===undefined)delete process.env.LANDING_MENTOR_PREVIEW_ENABLED;else process.env.LANDING_MENTOR_PREVIEW_ENABLED=initial;});
test('one atomic budget reservation precedes the one permitted model attempt',async()=>{
  const result=await POST(request({message:'会计应届生，想转运营',requestId:id}));
  expect(result.status).toBe(200);expect((await result.json()).source).toBe('model');
  expect(limit).toHaveBeenCalledTimes(1);
  expect(limit).toHaveBeenCalledWith(expect.any(Request),id);
  expect(model).toHaveBeenCalledTimes(1);
  expect(model).toHaveBeenCalledWith('会计应届生，想转运营',id,expect.objectContaining({onUsage:expect.any(Function)}));
  expect(result.headers.get('cache-control')).toContain('no-store');
});
test('budget denial preserves the original without a model call',async()=>{
  limit.mockResolvedValueOnce({allowed:false});
  const body=await (await POST(request({message:'我想先说一句',requestId:id}))).json();
  expect(body.source).toBe('fallback');expect(body.understanding).toContain('我想先说一句');expect(model).not.toHaveBeenCalled();
});
test('disabled rollout, missing RPC and failed budget enforcement all fail closed',async()=>{
  process.env.LANDING_MENTOR_PREVIEW_ENABLED='0';await POST(request({message:'虚构输入',requestId:id}));
  expect(limit).not.toHaveBeenCalled();
  process.env.LANDING_MENTOR_PREVIEW_ENABLED='1';limit.mockRejectedValue(new Error('sensitive internal error'));
  expect(JSON.stringify(await (await POST(request({message:'虚构输入',requestId:id}))).json())).not.toContain('sensitive');
  expect(model).not.toHaveBeenCalled();
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
