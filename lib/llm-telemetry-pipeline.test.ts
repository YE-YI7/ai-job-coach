import OpenAI from 'openai';
import {callLLM} from './llm';
import {getDbClient} from './db';
jest.mock('openai');
jest.mock('./db');
jest.mock('./generation-context',()=>({getGenerationContext:()=>({operation:'qa_telemetry_fixture',requestId:'fixture-not-a-user'})}));

describe('real usage-to-telemetry pipeline, isolated fake supplier/database',()=>{
 const initial={...process.env};
 const insert=jest.fn().mockResolvedValue({error:null});
 beforeEach(()=>{
  jest.clearAllMocks();process.env.LLM_STUB='0';
  process.env.HOSTED_LLM_PROVIDER='stepfun';process.env.HOSTED_LLM_MODEL='step-3.7-flash';process.env.STEPFUN_API_KEY='fixture-not-a-real-key';
  (getDbClient as jest.Mock).mockResolvedValue({from:jest.fn().mockReturnValue({insert})});
 });
 afterAll(()=>{process.env=initial;});
 const usage={prompt_tokens:1000,completion_tokens:200,total_tokens:1200,cached_tokens:600};
 test.each([false,true])('new %s-streaming completion writes actual cache fields and nonnull reference cost',async stream=>{
  const create=jest.fn().mockResolvedValue(stream?(async function*(){
   yield {choices:[{delta:{content:'fixture reply'},finish_reason:'stop'}],usage};
  })():{choices:[{message:{content:'fixture reply'},finish_reason:'stop'}],usage});
  (OpenAI as unknown as jest.Mock).mockImplementation(()=>({chat:{completions:{create}}}));
  const onUsage=jest.fn();
  expect(await callLLM([{role:'user',content:'fictional input'}],{onUsage,...(stream?{onDelta:()=>{}}:{}),maxRetries:0})).toBe('fixture reply');
  expect(insert).toHaveBeenCalledTimes(1);
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({operation:'qa_telemetry_fixture',provider:'stepfun',model:'step-3.7-flash',cache_hit_tokens:600,cache_miss_tokens:400,input_tokens:1000,output_tokens:200,pricing_version:'stepfun/2026-10-23/reference/cny-usd-fx7.2'}));
  expect(insert.mock.calls[0][0].estimated_cost_usd).toBeCloseTo((400*1.35+600*0.27+200*8.1)/1_000_000/7.2,12);
  expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({cacheHitTokens:600}));
  expect(create).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(insert.mock.calls)).not.toMatch(/fictional input|fixture reply|fixture-not-a-real-key/);
 });
 test('missing cache report is null to Eval, while storage estimate is labelled conservative',async()=>{
  const create=jest.fn().mockResolvedValue({choices:[{message:{content:'ok'},finish_reason:'stop'}],usage:{prompt_tokens:1000,completion_tokens:200}});
  (OpenAI as unknown as jest.Mock).mockImplementation(()=>({chat:{completions:{create}}}));
  const onUsage=jest.fn();await callLLM([{role:'user',content:'fictional'}],{onUsage,maxRetries:0});
  expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({cacheHitTokens:null}));
  expect(insert.mock.calls[0][0].pricing_version).toContain('cache-unknown-upper-bound');
 });
 test('truncated billable response stays an error but retains reported cost/cache',async()=>{
  const create=jest.fn().mockResolvedValue({choices:[{message:{content:'partial'},finish_reason:'length'}],usage});
  (OpenAI as unknown as jest.Mock).mockImplementation(()=>({chat:{completions:{create}}}));
  await expect(callLLM([{role:'user',content:'fictional'}],{maxRetries:0})).rejects.toThrow('Incomplete response');
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({status:'error',cache_hit_tokens:600,estimated_cost_usd:expect.any(Number)}));
 });
});
