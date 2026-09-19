import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { summarizeInterview } from "@/lib/interview/llm";
import { acquireInterviewGenerationClaim, completeInterviewGenerationClaim, releaseInterviewGenerationClaim } from "@/lib/interview-generation-claims";
import { createOpportunitySnapshot } from "@/lib/coach-harness/repository";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";

jest.mock("@/lib/auth");
jest.mock("@/lib/db");
jest.mock("@/lib/interview/llm");
jest.mock("@/lib/interview-generation-claims");
jest.mock("@/lib/coach-harness/repository");
jest.mock("@/lib/tokenpay-recovery");
jest.mock("@/lib/generation-context", () => ({
  runWithGenerationContext: jest.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

function mockTableChain() {
  const q: Record<string, jest.Mock> = {};
  for (const m of ["select", "eq", "order", "update"]) q[m] = jest.fn(() => q);
  q.single = jest.fn(async () => ({ data: null, error: null }));
  q.maybeSingle = jest.fn(async () => ({ data: null, error: null }));
  q.then = jest.fn((resolve) => resolve({ data: null, error: null }));
  return q;
}

function mockDbClient(tables: Record<string, unknown>) {
  return {
    from: jest.fn((table: string) => tables[table] || mockTableChain()),
  };
}

function arrangeHappyPath(userId: string, sessionId: string) {
  const sessionQ = mockTableChain();
  sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: userId, round_type: "业务面", jd: "JD", opportunity_id: "opp-1" }, error: null });
  const questionsQ = mockTableChain();
  questionsQ.select = jest.fn().mockReturnValue({
    eq: jest.fn().mockReturnValue({
      order: jest.fn().mockResolvedValue({ data: [{ id: "q1", question_text: "问题1" }], error: null }),
    }),
  });
  const answersQ = mockTableChain();
  answersQ.select = jest.fn().mockReturnValue({
    eq: jest.fn().mockReturnValue({
      order: jest.fn().mockResolvedValue({
        data: [{ question_id: "q1", answer: "回答1", assessment: { status: "assessed", score: 80 } }],
        error: null,
      }),
    }),
  });
  const oppQ = mockTableChain();
  oppQ.maybeSingle = jest.fn().mockResolvedValue({ data: { metadata: { actions: [] } }, error: null });
  oppQ.update = jest.fn(() => oppQ);
  (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({
    interview_sessions: sessionQ,
    interview_questions: questionsQ,
    interview_answers: answersQ,
    coach_opportunities: oppQ,
  }));
}

const mockSummary = {
  overallScore: 80,
  grade: "B",
  gradeNext: "再练一次",
  verdict: "还行",
  strengths: ["表达清晰"],
  weaknesses: ["缺数据"],
  suggestions: ["补数据"],
  dimensions: [],
  questionBreakdown: [{ questionId: "q1", score: 80, decisiveFinding: "缺结果" }],
  nextActions: [{ title: "补量化", reason: "缺数据", doneWhen: "能说出数字", priority: "high" }],
};

/**
 * 「先用户复盘、后 AI 点评」的落库链路：
 * userReflection 必须透传给总结模型，并原样存进 snapshot，让用户能分清「我怎么判断」和「模型补了什么」。
 */
describe("interview complete userReflection passthrough", () => {
  const userId = "user-1";
  const sessionId = "session-reflection";

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: userId });
    (acquireInterviewGenerationClaim as jest.Mock).mockResolvedValue({ state: "idle" });
    (completeInterviewGenerationClaim as jest.Mock).mockResolvedValue(undefined);
    (releaseInterviewGenerationClaim as jest.Mock).mockResolvedValue(undefined);
    (createOpportunitySnapshot as jest.Mock).mockResolvedValue({ id: "snap-1" });
    (tokenPayRecoveryResponse as jest.Mock).mockReturnValue(null);
    (summarizeInterview as jest.Mock).mockResolvedValue(mockSummary);
    arrangeHappyPath(userId, sessionId);
  });

  test("userReflection 透传给 summarizeInterview 并写入 snapshot", async () => {
    const response = await POST(new Request("http://localhost/api/interview/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, opportunityId: "opp-1", userReflection: "  问：哪题别扭\n答：第二题卡在指标口径  " }),
    }));
    expect(response.status).toBe(200);
    expect(summarizeInterview).toHaveBeenCalledWith(expect.objectContaining({
      candidateSelfReview: "问：哪题别扭\n答：第二题卡在指标口径",
    }));
    expect(createOpportunitySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      snapshotType: "interview_feedback",
      content: expect.objectContaining({ candidateSelfReview: "问：哪题别扭\n答：第二题卡在指标口径" }),
      metadata: expect.objectContaining({ hasCandidateSelfReview: true }),
    }));
  });

  test("老客户端不带 userReflection：总结照常生成，snapshot 如实记 null", async () => {
    const response = await POST(new Request("http://localhost/api/interview/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, opportunityId: "opp-1" }),
    }));
    expect(response.status).toBe(200);
    expect(summarizeInterview).toHaveBeenCalledWith(expect.objectContaining({ candidateSelfReview: undefined }));
    expect(createOpportunitySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.objectContaining({ candidateSelfReview: null }),
    }));
  });
});
