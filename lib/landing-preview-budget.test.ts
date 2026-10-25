import {consumeLandingPreviewBudget} from './landing-preview-budget';
import {getDbClient} from './db';
jest.mock('./db',()=>({getDbClient:jest.fn()}));
const rpc=jest.fn(),db=getDbClient as jest.Mock;
const original={...process.env};
beforeEach(()=>{
  jest.clearAllMocks();process.env.RATE_LIMIT_SECRET='synthetic-local-test';
  db.mockResolvedValue({rpc});rpc.mockResolvedValue({data:[{allowed:true,retry_after_seconds:30}],error:null});
});
afterAll(()=>{process.env=original;});
const request=(ip:string)=>new Request('https://test.invalid/api/landing/mentor',{headers:{'x-real-ip':ip}});
test('one service-only RPC receives hashes only; global/intent keys do not change with IP',async()=>{
  await consumeLandingPreviewBudget(request('192.0.2.7'),'synthetic-intent');
  await consumeLandingPreviewBudget(request('192.0.2.8'),'synthetic-intent');
  const [one,two]=rpc.mock.calls;
  expect(one[0]).toBe('consume_landing_mentor_budget');
  expect(Object.values(one[1])).toHaveLength(3);
  expect(Object.values(one[1]).every(value=>/^[a-f0-9]{64}$/.test(String(value)))).toBe(true);
  expect(JSON.stringify(one)).not.toMatch(/192\.0\.2|synthetic-local-test|synthetic-intent/);
  expect(one[1].p_global_key_hash).toBe(two[1].p_global_key_hash);
  expect(one[1].p_intent_key_hash).toBe(two[1].p_intent_key_hash);
  expect(one[1].p_ip_key_hash).not.toBe(two[1].p_ip_key_hash);
});
test('missing database, missing RPC and malformed response cannot fund a model',async()=>{
  db.mockResolvedValueOnce(null);
  await expect(consumeLandingPreviewBudget(request('192.0.2.7'),'test')).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValueOnce({error:{code:'missing'}});
  await expect(consumeLandingPreviewBudget(request('192.0.2.7'),'test')).rejects.toThrow();
  rpc.mockResolvedValueOnce({data:{allowed:'false'},error:null});
  await expect(consumeLandingPreviewBudget(request('192.0.2.7'),'test')).rejects.toThrow();
});
test('denial stays denial, not a truthy string or a fallback to unmetered mode',async()=>{
  rpc.mockResolvedValueOnce({data:[{allowed:false,retry_after_seconds:1}],error:null});
  expect(await consumeLandingPreviewBudget(request('192.0.2.7'),'test')).toMatchObject({allowed:false});
});
