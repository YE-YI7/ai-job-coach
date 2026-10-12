import {chatAttemptBudget} from "./chat-deadline";
test("first attempt reserves recovery and fallback time",()=>{
  expect(chatAttemptBudget(40000,true,1)).toEqual({timeoutMs:52000,firstTokenTimeoutMs:12000});
});
test("retry never restarts the full deadline",()=>{
  expect(chatAttemptBudget(95000,true,2).timeoutMs).toBe(15000);
  expect(()=>chatAttemptBudget(108000,true,2)).toThrow("TIMEOUT");
});
test("explicit model has bounded first response and no retry reserve",()=>{
  expect(chatAttemptBudget(60000,false,1)).toEqual({timeoutMs:50000,firstTokenTimeoutMs:25000});
});
