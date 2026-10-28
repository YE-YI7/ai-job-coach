import { buildInterviewHistory, historyFromRecord, interviewProgress, questionMatches } from "./history";
import type { InterviewRoundtableSession } from "@/lib/opportunities/types";

const session = { id: "s", round_type: "业务面", created_at: "2026-10-28T00:00:00Z" };
const questions = [
  { id: "a", session_id: "s", question_text: "实际主问题", tips: { _harness: { ordinal: 0 } } },
  { id: "b", session_id: "s", question_text: "基于上次回答的真实追问", tips: { _harness: { ordinal: 1, linkage: { previousQuestionId: "a" } } } },
  { id: "c", session_id: "s", question_text: "未到的问题", tips: { _harness: { ordinal: 2 } } },
];
const seen = (questionId: string) => ({ captured_at: "2026-10-28T00:00:10Z",
  metadata: { kind: "interview_progress", sessionId: "s", action: "seen", questionId } });

test("exact pending answer is already a real answer even when model feedback fails", () => {
  const result = buildInterviewHistory(session, questions, [], [{ id: "draft", content: "已提交的原话",
    captured_at: "2026-10-28T00:00:02Z", metadata: { kind: "interview_pending_answer", sessionId: "s", questionId: "a", status: "pending" } }]);
  expect(result.turns[0].answer).toBe("已提交的原话");
  expect(result.turns[0].attempts[0].state).toBe("pending");
  expect(result.currentIndex).toBe(0);
  expect(interviewProgress(result).answered).toBe(1);
});
test("saved answer and its pending write are not counted twice, earlier different answers are retained", () => {
  const answers = [{ id: "1", question_id: "a", answer: "第一遍", created_at: "2026-10-28T00:00:01Z" },
    { id: "2", question_id: "a", answer: "第二遍", created_at: "2026-10-28T00:00:02Z", assessment: { followUp: "口径是怎么算的？" } }];
  const sources = [{ id: "draft", content: "第二遍", captured_at: "2026-10-28T00:00:02Z",
    metadata: { kind: "interview_pending_answer", sessionId: "s", questionId: "a", status: "pending" } }];
  const result = buildInterviewHistory(session, questions, answers, sources);
  expect(result.turns[0].attempts.map(attempt => attempt.answer)).toEqual(["第一遍", "第二遍"]);
  expect(interviewProgress(result).answered).toBe(1);
  expect(questionMatches(result.turns[0], "口径")).toBe(true);
});
test("only actually reached linked questions count as followups, suggested followups do not", () => {
  const result = buildInterviewHistory(session, questions, [{ id: "1", question_id: "a", answer: "原话",
    created_at: session.created_at, assessment: { followUp: "建议追问" } }], []);
  expect(interviewProgress(result).followups).toBe(0);
  const reached = buildInterviewHistory(session, questions, [], [seen("b")]);
  expect(interviewProgress(reached).followups).toBe(1);
  expect(questionMatches(reached.turns[1], "真实追问")).toBe(true);
});
test("skip, unanswered and untouched are distinct and skipping followup preserves main answer", () => {
  const sources = [seen("a"), seen("b"), { content: "稍后练", captured_at: session.created_at,
    metadata: { kind: "interview_pending_answer", sessionId: "s", questionId: "b", status: "skipped" } }];
  const result = buildInterviewHistory(session, questions, [{ id: "1", question_id: "a", answer: "主回答",
    created_at: session.created_at }], sources);
  expect(interviewProgress(result)).toMatchObject({ answered: 1, skipped: 1, unanswered: 0, unseen: 1 });
  expect(interviewProgress(buildInterviewHistory(session, questions, [], [seen("a")]))).toMatchObject({ unanswered: 1, unseen: 2 });
});
test("longest uses individual answer not question aggregate; Unicode code points are counted", () => {
  const result = buildInterviewHistory(session, questions, [
    { id: "1", question_id: "a", answer: "甲".repeat(60), created_at: "1" },
    { id: "2", question_id: "a", answer: "乙".repeat(60), created_at: "2" },
    { id: "3", question_id: "b", answer: "👍".repeat(100), created_at: "3" },
  ], []);
  expect(interviewProgress(result).longest).toMatchObject({ questionId: "b", attemptId: "3", length: 100 });
});
test("elapsed time requires a real end event and unrelated sessions cannot supply state", () => {
  expect(interviewProgress(buildInterviewHistory(session, questions, [], [])).seconds).toBeNull();
  const result = buildInterviewHistory(session, questions, [], [
    { captured_at: "2026-10-28T00:01:03Z", metadata: { kind: "interview_progress", sessionId: "s", action: "end" } },
    { captured_at: "2026-10-28T00:01:09Z", metadata: { kind: "interview_progress", sessionId: "foreign", action: "seen", questionId: "c" } },
  ]);
  expect(result.status).toBe("completed"); expect(interviewProgress(result).seconds).toBe(63);
  expect(result.turns[2].seenAt).toBeUndefined();
});
test("historical question snapshot survives all later source changes without mutation", () => {
  const original = structuredClone({ session, questions });
  const result = buildInterviewHistory(session, questions, [], []);
  expect({ session, questions }).toEqual(original);
  questions[0].question_text = "新题库改题";
  expect(result.turns[0].question).toBe("实际主问题");
  questions[0].question_text = "实际主问题";
});
test("legacy skip marker is not an answer and missing original is not invented", () => {
  const record = { id: "old", round: "一面", createdAt: session.created_at, currentIndex: 0, status: "completed",
    turns: [{ questionId: "a", question: "旧问题", answer: "[已跳过，未评分] 稍后" }] } as InterviewRoundtableSession;
  expect(interviewProgress(historyFromRecord(record))).toMatchObject({ answered: 0, skipped: 1, seconds: null });
});
