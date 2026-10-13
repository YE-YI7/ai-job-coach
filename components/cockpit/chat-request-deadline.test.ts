import {chatRequestSignal,withChatRequestDeadline} from "./chat-request-deadline";
test.each(["overall","inner"])("preserves %s deadline rather than replacing the quota check's timeout",name=>{
 const overall=new AbortController(),inner=new AbortController();const signal=chatRequestSignal(overall.signal,inner.signal);
 (name==="overall"?overall:inner).abort();expect(signal.aborted).toBe(true);
});
afterEach(()=>jest.useRealTimers());
test("missing headers cannot leave the composer pending forever",async()=>{
 jest.useFakeTimers();let signal:AbortSignal|undefined;
 const pending=withChatRequestDeadline(s=>{signal=s;return new Promise(()=>{});},150);
 const assertion=expect(pending).rejects.toThrow("原回答已保留");
 await jest.advanceTimersByTimeAsync(150);await assertion;expect(signal?.aborted).toBe(true);
});
test("deadline covers a stalled response body, not just headers",async()=>{
 jest.useFakeTimers();const pending=withChatRequestDeadline(async()=>{await Promise.resolve();return new Promise(()=>{});},150);
 const assertion=expect(pending).rejects.toThrow("避免重复提交");await jest.advanceTimersByTimeAsync(150);await assertion;
});
test("successful response cleans up the timer without aborting",async()=>{
 jest.useFakeTimers();let signal:AbortSignal|undefined;
 expect(await withChatRequestDeadline(async s=>{signal=s;return "saved";},150)).toBe("saved");
 expect(jest.getTimerCount()).toBe(0);await jest.advanceTimersByTimeAsync(200);expect(signal?.aborted).toBe(false);
});
