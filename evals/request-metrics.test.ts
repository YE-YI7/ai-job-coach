import { requestMetrics } from "./request-metrics";
test("把失败和未完成算进分母，去重重试，已完成不冒充已读", () => {
  const event = (id: string, state: string, user = "a") => ({ user_id: user, event_name: `agent_answer_${state}`, properties: { request_id: id, harness_version: "v" } });
  expect(requestMetrics([event("1","started"),event("1","completed"),event("1","interrupted"),event("1","adopted"),event("1","adopted"),event("2","started"),event("2","failed"),event("3","started")])).toEqual([
    {version:"v",started:3,serverCompleted:1,failed:1,unfinished:1,interrupted:1,savedToNote:1,serverCompletionRate:1/3,interruptionRate:1/3,noteAdoptionRate:1,missingStartEvents:0},
  ]);
});
test("不同用户相同 requestId 不合并，窗口缺 started 不捏造分母", () => {
  const rows = requestMetrics([{user_id:"a",event_name:"agent_answer_completed",properties:{request_id:"1"}}, {user_id:"b",event_name:"agent_answer_started",properties:{request_id:"1"}}]);
  expect(rows[0]).toMatchObject({started:1,serverCompleted:0,missingStartEvents:1,noteAdoptionRate:null});
});
