import { getDbClient } from "@/lib/db";
import { compileContextBundle } from "./context";
import { createCoachRun } from "./repository";
import { FakeDb } from "./run-ledger/testing/fake-db";
jest.mock("@/lib/db");
const context = () => compileContextBundle({ userId: "owner", task: "mock_interview", claims: [], currentInput: "我的真实回答", attachments: [{ id: "interview-jd", label: "JD", text: "用户研究", required: true }] });
test("附件的规则、必需标记和实际成本进入审计，而不是全为默认值", async () => {
  const db = new FakeDb();(getDbClient as jest.Mock).mockResolvedValue(db);
  await createCoachRun({ userId: "owner", task: "mock_interview", goal: "答题", executor: "hosted_api", context: context() });
  expect(db.rows("coach_run_context_selections")).toContainEqual(expect.objectContaining({ kind: "attachment", rule: "required:attachment", required: true, cost: expect.any(Number) }));
  expect(db.rows("coach_run_context_selections").find(row => row.kind === "attachment")!.cost).toBeGreaterThan(0);
});
test("审计写失败不能静默宣称任务已启动，已有任务行明确失败", async () => {
  const db = new FakeDb();db.fail("coach_run_context_selections", "insert", Error("audit insert failed"));
  (getDbClient as jest.Mock).mockResolvedValue(db);
  await expect(createCoachRun({ userId: "owner", task: "mock_interview", goal: "答题", executor: "hosted_api", context: context() })).rejects.toThrow("audit insert failed");
  expect(db.rows("coach_runs")[0].status).toBe("failed");
});
