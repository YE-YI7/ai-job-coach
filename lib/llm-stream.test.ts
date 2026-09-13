import OpenAI from "openai";
import {callLLM} from "./llm";
jest.mock("openai");
jest.mock("./llm-telemetry",()=>({normalizeGenerationUsage:()=>({inputTokens:10,outputTokens:2,totalTokens:12}),estimateGenerationCost:()=>({}),recordGenerationEvent:jest.fn().mockResolvedValue(undefined),classifyGenerationFailure:()=>"unknown"}));
describe("upstream streaming",()=>{
 const original=process.env.DEEPSEEK_API_KEY;
 beforeEach(()=>{jest.clearAllMocks();process.env.DEEPSEEK_API_KEY="test-only";});
 afterAll(()=>{if(original===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=original;});
 test("delivers text incrementally and retains final usage",async()=>{
  const create=jest.fn().mockResolvedValue((async function*(){yield {model:"m",choices:[{delta:{content:"你好"}}]};yield {model:"m",choices:[{delta:{},finish_reason:"stop"}],usage:{prompt_tokens:10,completion_tokens:2,total_tokens:12}};})());
  (OpenAI as unknown as jest.Mock).mockImplementation(()=>({chat:{completions:{create}}}));
  const onDelta=jest.fn(),onUsage=jest.fn();
  expect(await callLLM([{role:"user",content:"hi"}],{onDelta,onUsage,maxRetries:0,timeoutMs:100})).toBe("你好");
  expect(onDelta).toHaveBeenCalledWith("你好");expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({model:"m",inputTokens:10,outputTokens:2}));
  expect(create.mock.calls[0][0]).toMatchObject({stream:true,stream_options:{include_usage:true}});
 });
 test("truncated upstream cannot return a successful answer",async()=>{
  const create=jest.fn().mockResolvedValue((async function*(){yield {choices:[{delta:{content:"半截"}}]};})());
  (OpenAI as unknown as jest.Mock).mockImplementation(()=>({chat:{completions:{create}}}));
  await expect(callLLM([{role:"user",content:"hi"}],{onDelta:()=>{},maxRetries:0,timeoutMs:100})).rejects.toThrow("中断");
  expect(create).toHaveBeenCalledTimes(1);
 });
 test("SDK ending normally on abort is still classified as timeout",async()=>{
  const create=jest.fn().mockImplementation(async(_request,{signal})=>(async function*(){
    await new Promise<void>(resolve=>signal.addEventListener("abort",()=>resolve(),{once:true}));
    yield {choices:[]};
  })());
  (OpenAI as unknown as jest.Mock).mockImplementation(()=>({chat:{completions:{create}}}));
  await expect(callLLM([{role:"user",content:"hi"}],{onDelta:()=>{},maxRetries:0,timeoutMs:10})).rejects.toThrow("timed out");
 });
});
