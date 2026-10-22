import { getDbClient } from "@/lib/db";
import { startResumeTrace, RESUME_TRACE_EVENT } from "./resume-trace";
import {withEvalObserver,type EvalSpan} from './eval-scope';
jest.mock("@/lib/db", () => ({ getDbClient: jest.fn() }));

test("private trace persists a lifecycle but no raw request id, résumé, answer or reasoning", async () => {
  const writes: unknown[] = [];
  const upsert=jest.fn(async(row)=>{writes.push(JSON.parse(JSON.stringify(row)));return {error:null};});
  (getDbClient as jest.Mock).mockResolvedValue({from:jest.fn(()=>({upsert}))});
  const run=await startResumeTrace("synthetic-owner", "sensitive-request@example.invalid",true);
  run.step("retrieval","no_close_example",0);await run.finish("completed");
  expect(upsert).toHaveBeenCalledTimes(3);
  expect(writes[0]).toMatchObject({event_name:RESUME_TRACE_EVENT,properties:{outcome:"running"}});
  expect(writes.at(-1)).toMatchObject({properties:{outcome:"completed",mode:"general_resume",quality:null}});
  expect(JSON.stringify(writes)).not.toContain("sensitive-request@example.invalid");
  expect(JSON.stringify(writes)).not.toMatch(/resumeText|jobDescription|compiledPrompt|reasoning/);
});

test("initial trace cannot silently disappear",async()=>{
  (getDbClient as jest.Mock).mockResolvedValue(null);
  await expect(startResumeTrace("u","r",true)).rejects.toThrow("RESUME_TRACE_UNAVAILABLE");
});

test('full I/O stays in the private observer and never leaks into metadata events',async()=>{
  const writes:unknown[]=[],spans:EvalSpan[]=[];
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>({upsert:async(row:unknown)=>{writes.push(structuredClone(row));return {error:null};}})});
  await withEvalObserver({spans,save:async()=>{}},async()=>{
    const trace=await startResumeTrace('owner','request',true);
    trace.step('context','compiled',undefined,{input:'PRIVATE-RESUME',output:'PRIVATE-COMPILED-PROMPT'});
    await trace.finish('completed');
  });
  expect(spans[0].input).toBe('PRIVATE-RESUME');
  expect(JSON.stringify(writes)).not.toContain('PRIVATE-');
});
