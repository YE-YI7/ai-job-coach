import { normalizeInterviewAssessment, restoreRoundtableSession, scoreBandLine, scoreBandShort } from "./interview-assessment-logic";
import type { InterviewRoundtableSession } from "@/lib/opportunities/types";

const restore = (value: unknown) => restoreRoundtableSession(value as InterviewRoundtableSession);
test("database-shaped legacy running assessment restores variance before transcript rendering", () => {
  const raw = { id: "saved", status: "running", currentIndex: 1, turns: [
    { questionId: "q1", question: "问题", answer: "真实答案", assessment: { status: "assessed", score: 70, summary: "评价", evidence: ["真实答案"], dimensions: [] } },
    { questionId: "q2", question: "下一题" },
  ] };
  // This is the exact old cast's rendering failure, not merely a shape assertion.
  expect(() => scoreBandShort(undefined as never)).toThrow();
  const session = restore(raw);
  const feedback = session.turns[0].assessment!;
  expect(feedback.status).toBe("assessed");
  expect(scoreBandShort(feedback.variance)).toBe("单次评审");
  expect(session.turns[0].answer).toBe("真实答案");
  expect(raw.turns[0].assessment).not.toHaveProperty("variance");
});
test("old completed summary without optional arrays renders with no invented dimensions", () => {
  const session = restore({ status: "completed", currentIndex: 0, turns: [], summary: { overallScore: 72, grade: "B", strengths: ["已有优势"] } });
  expect(session.summary!.dimensions).toEqual([]);
  expect(session.summary!.nextActions).toEqual([]);
  expect(session.summary!.strengths).toEqual(["已有优势"]);
  expect(scoreBandLine(session.summary!.variance)).toContain("未实测");
});
test("persisted view normalization is idempotent including measured variance", () => {
  const assessment = normalizeInterviewAssessment({ status: "assessed", score: 72, evidence: ["原话"], scoreBand: 3, scoreBandNote: "三次重跑" })!;
  const session = restore({ turns: [{ questionId: "q1", assessment }], currentIndex: 0 });
  expect(session.turns[0].assessment).toEqual(assessment);
});
test("missing turns, null turns and out-of-range index never crash restore", () => {
  expect(restore({ turns: null, currentIndex: 99 }).turns).toEqual([]);
  expect(restore({ turns: [null, { questionId: "q1" }], currentIndex: 99 }).currentIndex).toBe(0);
});
test("legacy bare score without evidence is not silently treated as a passed answer", () => {
  const session = restore({ turns: [{ questionId: "q1", assessment: { score: 60, summary: "旧记录" } }] });
  expect(session.turns[0].assessment!.status).toBe("needs_more_input");
  expect(session.turns[0].assessment!.score).toBeNull();
});
