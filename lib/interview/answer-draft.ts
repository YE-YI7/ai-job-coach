import { createHash } from "node:crypto";
import { getDbClient } from "@/lib/db";

type DraftScope = { userId: string; sessionId: string; questionId: string; opportunityId?: string | null };
function identity(scope: DraftScope, answer: string) {
  const hash = createHash("sha256").update(JSON.stringify([scope.userId, scope.sessionId, scope.questionId, answer])).digest("hex");
  return { hash, id: `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}` };
}

export async function saveInterviewDraft(scope: DraftScope, answer: string) {
  const db = await getDbClient();
  if (!db) throw new Error("回答未能保存，尚未开始分析，请保留原文后重试");
  const { id, hash } = identity(scope, answer);
  const { error } = await db.from("coach_sources").upsert({
    id, user_id: scope.userId, opportunity_id: scope.opportunityId || null,
    source_type: "user_answer", title: "模拟面试待分析回答", content: answer, content_hash: hash,
    metadata: { kind: "interview_pending_answer", sessionId: scope.sessionId, questionId: scope.questionId, status: "pending" },
    captured_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw new Error("回答未能保存，尚未开始分析，请保留原文后重试");
  return id;
}

export async function finishInterviewDraft(scope: DraftScope, answer: string) {
  const db = await getDbClient();
  if (!db) return;
  const { error } = await db.from("coach_sources").update({ metadata: {
    kind: "interview_pending_answer", sessionId: scope.sessionId, questionId: scope.questionId, status: "completed",
  } }).eq("id", identity(scope, answer).id).eq("user_id", scope.userId);
  // A cleanup failure must never hide an already saved assessment.
  if (error) console.error("Interview draft completion failed", error.code);
}
