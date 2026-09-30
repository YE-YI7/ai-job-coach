import { reserveOutreach } from "./runtime";
import { getDbClient } from "@/lib/db";
import { FakeDb } from "../run-ledger/testing/fake-db";
jest.mock("@/lib/db");
const userId = "00000000-0000-4000-8000-000000000001", opportunityId = "00000000-0000-4000-8000-000000000002";
const now = Date.parse("2026-10-01T12:00:00Z");
let db: FakeDb;
beforeEach(() => { jest.resetAllMocks(); db = new FakeDb({ coach_opportunities: [{ id: opportunityId, user_id: userId, stage: "applied", metadata: { stageEnteredAt: new Date(now - 4 * 86400000).toISOString() } }], coach_agent_turns: [{ id: "turn", user_id: userId, opportunity_id: opportunityId, learning_trace: null }] }); (getDbClient as jest.Mock).mockResolvedValue(db); });
test("服务端日上限持久化，刷新和并发只放行一次", async () => {
  const results = await Promise.all([reserveOutreach(userId, opportunityId, false, now), reserveOutreach(userId, opportunityId, false, now)]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await reserveOutreach(userId, opportunityId, false, now + 60_000)).toBeNull();
  expect(db.rows("product_events").filter(e => e.event_name === "agent_outreach_reserved")).toHaveLength(1);
});
test("打字、未知阶段时间、没有用户发言时静默；DB 错误不放行", async () => {
  expect(await reserveOutreach(userId, opportunityId, true, now)).toBeNull();
  db.rows("coach_opportunities")[0].metadata = {};
  expect(await reserveOutreach(userId, opportunityId, false, now)).toBeNull();
  db.fail("product_events", "select", { message: "down" });
  await expect(reserveOutreach(userId, opportunityId, false, now)).rejects.toThrow("facts unavailable");
});
test("隔日仍必须满 24 小时；即使审计记录缺失，cadence CAS 也不放行", async () => {
  await reserveOutreach(userId, opportunityId, false, now);
  db.seedRows("product_events", db.rows("product_events").filter(e => e.event_name === "agent_outreach_cadence"));
  expect(await reserveOutreach(userId, opportunityId, false, now + 23 * 3600000)).toBeNull();
  expect(await reserveOutreach(userId, opportunityId, false, now + 24 * 3600000)).not.toBeNull();
});
test("刚失败的回答冷却，错误的用户/岗位不触达", async () => {
  db.seedRows("product_events", [{ user_id: userId, event_name: "agent_answer_failed", occurred_at: new Date(now - 1000).toISOString() }]);
  expect(await reserveOutreach(userId, opportunityId, false, now)).toBeNull();
  expect(await reserveOutreach("another", opportunityId, false, now)).toBeNull();
});
