import { getDbClient } from "@/lib/db";
import { FakeDb } from "@/lib/coach-harness/run-ledger/testing/fake-db";
import { recordInterviewProgress } from "./history-store";
jest.mock("@/lib/db");
const owner = "owner", other = "other", sid = "session", qid = "question";
let db: FakeDb;
beforeEach(() => {
  db = new FakeDb({ interview_sessions: [{ id: sid, user_id: owner, opportunity_id: "job" }],
    interview_questions: [{ id: qid, session_id: sid, question_text: "当时的追问原文", tips: { _harness: { linkage: { previousQuestionId: "main" } } } }] });
  jest.mocked(getDbClient).mockResolvedValue(db as unknown as Awaited<ReturnType<typeof getDbClient>>);
});
test("another account cannot write progress into owned session", async () => {
  expect(await recordInterviewProgress(other, sid, { action: "end" })).toBe(false);
  expect(db.rows("coach_sources")).toEqual([]);
});
test("foreign question cannot be associated with this session", async () => {
  db.seedRows("interview_questions", [{ id: qid, session_id: "foreign" }]);
  expect(await recordInterviewProgress(owner, sid, { action: "seen", questionId: qid })).toBe(false);
  expect(db.rows("coach_sources")).toEqual([]);
});
test("display event captures server question text and linkage, repeat never changes original", async () => {
  await recordInterviewProgress(owner, sid, { action: "seen", questionId: qid });
  const original = structuredClone(db.rows("coach_sources"));
  db.rows("interview_questions")[0].question_text = "题库后来变了";
  await recordInterviewProgress(owner, sid, { action: "seen", questionId: qid });
  expect(db.rows("coach_sources")).toEqual(original);
  expect(original[0].metadata).toMatchObject({ questionText: "当时的追问原文", followsQuestionId: "main" });
});
test("end is idempotent; persistence failure never reports true", async () => {
  expect(await recordInterviewProgress(owner, sid, { action: "end" })).toBe(true);
  expect(await recordInterviewProgress(owner, sid, { action: "end" })).toBe(true);
  expect(db.rows("coach_sources")).toHaveLength(1);
  db.fail("coach_sources", "upsert", { code: "write_failure" });
  await expect(recordInterviewProgress(owner, sid, { action: "end" })).rejects.toEqual({ code: "write_failure" });
});
