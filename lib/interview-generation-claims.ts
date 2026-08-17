import { getDbClient } from "./db";

export type InterviewClaimResult =
  | { state: "acquired" }
  | { state: "processing" }
  | { state: "completed"; result: unknown };

export async function acquireInterviewGenerationClaim(input: {
  key: string;
  userId: string;
  sessionId: string;
  operation: "answer_assessment" | "session_summary";
}, allowStaleRecovery = true): Promise<InterviewClaimResult> {
  const db = await getDbClient();
  if (!db) throw new Error("数据库连接失败");
  const { error } = await db.from("interview_generation_claims").insert({
    idempotency_key: input.key,
    user_id: input.userId,
    session_id: input.sessionId,
    operation: input.operation,
    status: "processing",
  });
  if (!error) return { state: "acquired" };
  if (error.code !== "23505") throw error;

  const { data, error: readError } = await db
    .from("interview_generation_claims")
    .select("status,result,updated_at")
    .eq("idempotency_key", input.key)
    .eq("user_id", input.userId)
    .single();
  if (readError || !data) throw readError || new Error("生成任务状态不可用");
  if (data.status === "processing" && allowStaleRecovery) {
    const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: removed, error: deleteError } = await db
      .from("interview_generation_claims")
      .delete()
      .eq("idempotency_key", input.key)
      .eq("user_id", input.userId)
      .eq("status", "processing")
      .lt("updated_at", staleBefore)
      .select("idempotency_key");
    if (deleteError) throw deleteError;
    if (removed?.length) return acquireInterviewGenerationClaim(input, false);
  }
  return data.status === "completed"
    ? { state: "completed", result: data.result }
    : { state: "processing" };
}

export async function completeInterviewGenerationClaim(key: string, userId: string, result: unknown) {
  const db = await getDbClient();
  if (!db) throw new Error("数据库连接失败");
  const { error } = await db.from("interview_generation_claims").update({
    status: "completed",
    result,
    updated_at: new Date().toISOString(),
  }).eq("idempotency_key", key).eq("user_id", userId);
  if (error) throw error;
}

export async function releaseInterviewGenerationClaim(key: string, userId: string) {
  const db = await getDbClient();
  if (!db) return;
  const { error } = await db.from("interview_generation_claims")
    .delete()
    .eq("idempotency_key", key)
    .eq("user_id", userId)
    .eq("status", "processing");
  if (error) throw error;
}
