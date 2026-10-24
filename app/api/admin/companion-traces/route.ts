import { getDbClient } from "@/lib/db";
import { evalAdminAccess, evalJson } from "@/lib/coach-harness/eval-admin-http";
import { evalUuid } from "@/lib/coach-harness/eval-feedback";
import { redactEval } from "@/lib/coach-harness/eval-scope";
import { companionVisibleText } from "@/lib/coach-harness/companion-protocol";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const { error } = await evalAdminAccess(); if (error) return error;
  const params = new URL(request.url).searchParams;
  const userId = params.get("userId"), requestId = params.get("requestId");
  if (!evalUuid(userId) || !evalUuid(requestId)) return evalJson({ error: "用户或请求编号无效" }, 400);
  try {
    const db = await getDbClient(); if (!db) throw Error("unavailable");
    const turn = await db.from("coach_agent_turns").select("id,user_id,session_id,request_id,question,answer,opportunity_id,created_at,learning_trace").eq("user_id", userId).eq("request_id", requestId).maybeSingle();
    if (turn.error) throw turn.error;
    const row = turn.data, trace = row?.learning_trace;
    if (!row || !trace?.companion) return evalJson({ error: "未留存这条陪伴记录" }, 404);
    const plan = await db.from("coach_plans").select("id,version,tasks,opportunity_id").eq("user_id", userId).eq("id", trace.companion.planId).maybeSingle();
    if (plan.error) throw plan.error;
    return evalJson({ trace: redactEval({
      requestId, turnId: row.id, userId: row.user_id, sessionId: row.session_id, createdAt: row.created_at,
      input: companionVisibleText(row.question), output: row.answer,
      system: trace.compiledSystem ?? null, prompt: trace.compiledPrompt ?? null, modelOutput: trace.rawModelOutput ?? null,
      binding: trace.companion, model: trace.model ?? null, usage: trace.modelUsage ?? null, timing: trace.timing ?? null,
      knowledge: trace.knowledgeIds ?? [], materials: trace.materials ?? null, guards: trace.guards ?? [],
      currentPlan: plan.data ?? null,
      evidenceBoundary: "输入、模型原始输出与最终正文分别留存；当前计划不是历史快照。未留存字段为null，不补造简历Trace或修改ID。",
    }) });
  } catch { return evalJson({ error: "暂时无法读取这条陪伴记录" }, 503); }
}
