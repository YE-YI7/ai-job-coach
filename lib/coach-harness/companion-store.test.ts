import { attachCompanionFeedback, companionContext, openCompanion, submitCompanion } from "./companion-store";
import { companionPrompt } from "./companion-protocol";
import { getDbClient } from "@/lib/db";
import { getPlanById, getPlanHistory, updatePlanTasks, type CoachPlan } from "./plans";
jest.mock("@/lib/db", () => ({ getDbClient: jest.fn() }));
jest.mock("./plans", () => ({ getPlanById: jest.fn(), getPlanHistory: jest.fn(), updatePlanTasks: jest.fn() }));
const owner = "00000000-0000-4000-8000-000000000401", planId = "00000000-0000-4000-8000-000000000501", submissionId = "00000000-0000-4000-8000-000000000601", requestId = "00000000-0000-4000-8000-000000000701";
let row: CoachPlan; let turn: Record<string, unknown> | null;
const nextStep = { title: "核对字段口径", why: "原文提到同名字段含义不同", effort: "20 分钟", deliverable: "一个字段的两个定义", check: "能回指原表", stuck: "只交记得的含义" };
beforeEach(async () => {
  jest.clearAllMocks(); turn = null;
  (getPlanById as jest.Mock).mockImplementation(async (user, id) => user === owner && id === row?.id ? row : null);
  (getPlanHistory as jest.Mock).mockResolvedValue([]);
  (updatePlanTasks as jest.Mock).mockImplementation(async input => { if (input.expectedVersion !== row.version) throw Error("计划更新冲突：请刷新后重试"); row = { ...row, tasks: input.tasks, version: row.version + 1 }; return row; });
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: turn, error: null }), insert: (value: { tasks: CoachPlan["tasks"]; opportunity_id: string | null }) => ({ select: () => ({ single: async () => { row = { id: planId, version: 1, goalType: "learn_from_zero", opportunityId: value.opportunity_id, status: "active", tasks: value.tasks, revisionReason: null, createdAt: "", updatedAt: "" }; return { data: row, error: null }; } }) }) };
  (getDbClient as jest.Mock).mockResolvedValue({ from: () => q });
  await openCompanion(owner, "想转数据产品经理");
  await submitCompanion(owner, row.id, row.version, submissionId, "两张表的同名字段含义不一样");
});
function savedTurn(version = row.version, overrides: Record<string, unknown> = {}) {
  const binding = { planId, version, submissionId };
  turn = { question: companionPrompt(binding, "两张表的同名字段含义不一样"), answer: "你写了同名字段含义不一样，这次已经具体。", opportunity_id: null, learning_trace: { companion: { ...binding, review: { decision: "advance", reason: "有具体差异", step: nextStep } } }, ...overrides };
  return String(turn.answer);
}
test("saved reply advances only its original plan and same feedback retries are idempotent", async () => {
  const version = row.version, answer = savedTurn();
  await attachCompanionFeedback(owner, planId, version, submissionId, answer, requestId);
  expect(row.tasks[0].companion?.step).toEqual(nextStep);
  expect(row.tasks[0].companion?.action).toBe("not_started");
  const savedVersion = row.version;
  await attachCompanionFeedback(owner, planId, version, submissionId, answer, requestId);
  expect(row.version).toBe(savedVersion);
});
test("late feedback is saved as history, never overwrites an updated task", async () => {
  const version = row.version, answer = savedTurn();
  const before = row.tasks[0].companion?.step;
  row = { ...row, version: version + 1 };
  await attachCompanionFeedback(owner, planId, version, submissionId, answer, requestId);
  expect(row.tasks[0].companion?.step).toEqual(before);
  expect(row.tasks[0].companion?.submissions[0]).toMatchObject({ feedback: answer, reviewNote: expect.stringContaining("未覆盖") });
});
test("a known turn from another job or a prose submission ID is not write authority", async () => {
  const answer = savedTurn(row.version, { opportunity_id: "another-job" });
  await expect(attachCompanionFeedback(owner, planId, row.version, submissionId, answer, requestId)).rejects.toThrow("不是已保存");
  savedTurn(row.version, { question: `随便引用提交 ${submissionId}` });
  await expect(attachCompanionFeedback(owner, planId, row.version, submissionId, answer, requestId)).rejects.toThrow("不是已保存");
});
test("mentor input is read from the owner-bound stored version, changed content is rejected", async () => {
  const binding = { planId, version: row.version, submissionId };
  expect(await companionContext(owner, companionPrompt(binding, "两张表的同名字段含义不一样"), null)).toMatchObject({ binding });
  await expect(companionContext(owner, companionPrompt(binding, "换成伪造材料"), null)).rejects.toThrow("输入已变化");
  await expect(companionContext(owner, companionPrompt(binding, "两张表的同名字段含义不一样"), "another-job")).rejects.toThrow();
});
test("opening an unknown explicit plan cannot silently create a new goal", async () => {
  await expect(openCompanion(owner, "一些新约束", "00000000-0000-4000-8000-000000000999", 1)).rejects.toThrow("没有这份安排");
});
test("correcting an explicit goal title preserves plan identity and submitted evidence", async () => {
  const originalId = row.id, version = row.version;
  const submissions = structuredClone(row.tasks[0].companion?.submissions);
  await openCompanion(owner, "目标转行AI产品经理，每周能投入6小时，8周后展示练习项目", originalId, version);
  expect(updatePlanTasks).toHaveBeenCalledWith(expect.objectContaining({ planId: originalId, expectedVersion: version }));
  expect(row.id).toBe(originalId);
  expect(row.version).toBe(version + 1);
  expect(row.tasks[0].companion).toMatchObject({ goalTitle: "转 AI 产品经理", weeklyHours: "每周 6 小时", deadline: "8周后" });
  expect(row.tasks[0].companion?.submissions).toEqual(submissions);
});
