import { getDbClient } from "@/lib/db";
import { startResumeTrace, RESUME_TRACE_EVENT } from "./resume-trace";
jest.mock("@/lib/db", () => ({ getDbClient: jest.fn() }));

test("private trace persists a lifecycle but no raw request id, résumé, answer or reasoning", async () => {
  const writes: unknown[] = [];
  const upsert=jest.fn(async(row)=>{writes.push(JSON.parse(JSON.stringify(row)));return {error:null};});
  (getDbClient as jest.Mock).mockResolvedValue({from:jest.fn(()=>({upsert}))});
  const run=await startResumeTrace("synthetic-owner", "sensitive-request@example.invalid",true);
  run.step("retrieval","no_close_example",0);await run.finish("completed");
  expect(upsert).toHaveBeenCalledTimes(2);
  expect(writes[0]).toMatchObject({event_name:RESUME_TRACE_EVENT,properties:{outcome:"running"}});
  expect(writes[1]).toMatchObject({properties:{outcome:"completed",mode:"general_resume",quality:null}});
  expect(JSON.stringify(writes)).not.toContain("sensitive-request@example.invalid");
  expect(JSON.stringify(writes)).not.toMatch(/resumeText|jobDescription|compiledPrompt|reasoning/);
});

test("initial trace cannot silently disappear",async()=>{
  (getDbClient as jest.Mock).mockResolvedValue(null);
  await expect(startResumeTrace("u","r",true)).rejects.toThrow("RESUME_TRACE_UNAVAILABLE");
});
