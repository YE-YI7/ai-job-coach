import { POST } from "./route";
import { getDbClient } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { generateLinkedFollowUpQuestion } from "@/lib/interview/llm";
import { FakeDb } from "@/lib/coach-harness/run-ledger/testing/fake-db";
import { cancelTask } from "@/lib/coach-harness/run-ledger";
jest.mock("@/lib/db");
jest.mock("@/lib/auth");
jest.mock("@/lib/interview/llm");
jest.mock("@/lib/knowledge/context", () => ({ buildAgentKnowledgeContext: async () => ({ items: [{ id: "k1", title: "证据", description: "用实际观测验证假设", confidence: "high", evidence: [] }], contextText: "" }) }));
jest.mock("@/lib/generation-context", () => ({ runWithGenerationContext: (_input: unknown, action: () => unknown) => action() }));
const owner = "00000000-0000-4000-8000-000000000001", session = "00000000-0000-4000-8000-000000000002";
const before = "00000000-0000-4000-8000-000000000003", after = "00000000-0000-4000-8000-000000000004";
let db: FakeDb;
const request = () => new Request("http://localhost/api/interview/next", { method: "POST", body: JSON.stringify({ sessionId: session, previousQuestionId: before, nextQuestionId: after }) });
beforeEach(() => {
  jest.resetAllMocks();
  db = new FakeDb({ interview_sessions: [{ id: session, user_id: owner, jd: "发现用户问题并验证假设", round_type: "业务面" }],
    interview_questions: [{ id: before, session_id: session, question_text: "怎么验证？", tips: { _harness: { ordinal: 0 } } }, { id: after, session_id: session, question_text: "旧题", tips: { _harness: { ordinal: 1 } } }],
    interview_answers: [{ id: "answer-1", session_id: session, question_id: before, answer: "我记录排队时间，发现午饭等待十分钟", assessment: { status: "assessed" }, created_at: new Date().toISOString() }],
  });
  (getDbClient as jest.Mock).mockResolvedValue(db);
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: owner });
  (generateLinkedFollowUpQuestion as jest.Mock).mockResolvedValue({ question_text: "你记录排队时间，样本怎样选？", tips: { intent: "核验证据" }, sources: [{ source: "jd", pointer: "interview-jd" }, { source: "knowledge", pointer: "k1" }], linkage: { kind: "linked", previousQuestionId: before, tookFrom: ["我记录排队时间"] } });
});
test("实际生成入口收到真实上一答、预算内材料；保存后重复点击不再调用模型", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(generateLinkedFollowUpQuestion).toHaveBeenCalledWith(expect.objectContaining({ previousAnswer: "我记录排队时间，发现午饭等待十分钟", sourceMaterials: expect.objectContaining({ jd: [{ id: "interview-jd", text: "发现用户问题并验证假设" }] }) }));
  expect(db.rows("interview_questions")[1].question_text).toContain("样本");
  expect((await POST(request())).status).toBe(200);
  expect(generateLinkedFollowUpQuestion).toHaveBeenCalledTimes(1);
});
test("未完成回答不能推进，已回答的下一题不能覆盖", async () => {
  db.rows("interview_answers")[0].assessment = { status: "needs_more_input" };
  expect((await POST(request())).status).toBe(409);
  db.rows("interview_answers")[0].assessment = { status: "assessed" };
  db.applyInsert("interview_answers", [{ session_id: session, question_id: after }]);
  expect((await POST(request())).status).toBe(409);
  expect(generateLinkedFollowUpQuestion).not.toHaveBeenCalled();
});
test("跨用户会话不可读写", async () => {
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "another" });
  expect((await POST(request())).status).toBe(404);
  expect(generateLinkedFollowUpQuestion).not.toHaveBeenCalled();
});
test("模型失败保留原题和回答，显式重试可成功", async () => {
  (generateLinkedFollowUpQuestion as jest.Mock).mockRejectedValueOnce(Error("模型失败"));
  expect((await POST(request())).status).toBe(500);
  expect(db.rows("interview_questions")[1].question_text).toBe("旧题");
  expect(db.rows("interview_answers")).toHaveLength(1);
  expect((await POST(request())).status).toBe(200);
});
test("生成期间取消不改写下一题、不将取消任务报完成", async () => {
  (generateLinkedFollowUpQuestion as jest.Mock).mockImplementation(async () => {
    await cancelTask({ userId: owner, runId: String(db.rows("coach_runs")[0].id) });
    return { question_text: "晚到的新题", tips: {} };
  });
  expect((await POST(request())).status).toBe(409);
  expect(db.rows("interview_questions")[1].question_text).toBe("旧题");
  expect(db.rows("coach_runs")[0].status).toBe("cancelled");
});
