import { createHash } from "node:crypto";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { generateLinkedFollowUpQuestion } from "@/lib/interview/llm";
import { interviewMaterials } from "@/lib/interview/question-lineage";
import { buildAgentKnowledgeContext } from "@/lib/knowledge/context";
import { compileContextBundle, assertContextFits, renderContextForPrompt } from "@/lib/coach-harness";
import { readCompanyResearch, renderCompanyResearch } from "@/lib/coach-harness/research-runtime";
import { startTask, startExecution, getTaskLedger, completeTask, failTask } from "@/lib/coach-harness/run-ledger";
import { runWithGenerationContext } from "@/lib/generation-context";
import type { RoundType } from "@/lib/interview/types";

export const runtime = "nodejs";
export const maxDuration = 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** Explicit next-question CTA. One bounded call, persisted result, no default triple scoring. */
export async function POST(request: Request) {
  let scope: { userId: string; runId: string } | undefined;
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) return reply({ ok: false, error: "未认证" }, 401);
    const body = await request.json().catch(() => null);
    if (!body || ![body.sessionId, body.previousQuestionId, body.nextQuestionId].every(id => typeof id === "string" && uuid.test(id))
      || body.previousQuestionId === body.nextQuestionId) return reply({ ok: false, error: "题目绑定无效" }, 400);
    const db = await getDbClient();
    if (!db) throw Error("数据库不可用");
    const sessionQuery = await db.from("interview_sessions").select("id,jd,round_type,opportunity_id").eq("id", body.sessionId).eq("user_id", auth.id).maybeSingle();
    if (sessionQuery.error) throw sessionQuery.error;
    const session = sessionQuery.data;
    if (!session) return reply({ ok: false, error: "面试会话不存在" }, 404);
    const questions = await db.from("interview_questions").select("id,question_text,tips,created_at").eq("session_id", session.id).in("id", [body.previousQuestionId, body.nextQuestionId]);
    if (questions.error) throw questions.error;
    const previous = questions.data?.find((q: { id: string }) => q.id === body.previousQuestionId);
    const target = questions.data?.find((q: { id: string }) => q.id === body.nextQuestionId);
    if (!previous || !target) return reply({ ok: false, error: "题目不属于此面试" }, 404);
    const beforeOrdinal = previous.tips?._harness?.ordinal, nextOrdinal = target.tips?._harness?.ordinal;
    if (Number.isInteger(beforeOrdinal) && nextOrdinal !== beforeOrdinal + 1) return reply({ ok: false, error: "只能承接下一道题" }, 409);
    const answerQuery = await db.from("interview_answers").select("id,answer,assessment").eq("session_id", session.id).eq("question_id", previous.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (answerQuery.error) throw answerQuery.error;
    const answer = answerQuery.data;
    if (!answer?.answer?.trim() || answer.assessment?.status !== "assessed") return reply({ ok: false, error: "先完成这道题，再进入下一题" }, 409);
    const answered = await db.from("interview_answers").select("id").eq("session_id", session.id).eq("question_id", target.id).limit(1).maybeSingle();
    if (answered.error) throw answered.error;
    if (answered.data) return reply({ ok: false, error: "下一题已经回答，不覆盖已有题目" }, 409);
    if (target.tips?._harness?.previousAnswerId === answer.id) return reply({ ok: true, question: { ...target, session_id: session.id } });
    let resume = "", research = "";
    if (session.opportunity_id) {
      const jobQuery = await db.from("coach_opportunities").select("id,company,role,metadata").eq("id", session.opportunity_id).eq("user_id", auth.id).maybeSingle();
      if (jobQuery.error) throw jobQuery.error;
      if (!jobQuery.data) return reply({ ok: false, error: "岗位不存在" }, 404);
      resume = String(jobQuery.data.metadata?.resumeText || "").slice(0, 30000);
      research = renderCompanyResearch(await readCompanyResearch(auth.id, jobQuery.data).catch(() => null));
    }
    const knowledge = await buildAgentKnowledgeContext({ task: "mock_interview", query: `${previous.question_text} ${answer.answer.slice(0, 300)}`, limit: 5 });
    const context = compileContextBundle({ userId: auth.id, task: "mock_interview", claims: [], currentInput: answer.answer,
      questionSource: { id: previous.id, text: previous.question_text },
      knowledge: knowledge.items.map(item => ({ ...item, confidence: item.confidence || "medium", evidenceUrls: item.evidence.map(e => e.url) })),
      attachments: [{ id: "interview-jd", label: "岗位 JD", text: session.jd, required: true }, { id: "resume-text", label: "简历", text: resume, required: false }, { id: "company-research", label: "公司公开调研", text: research, required: false }],
      budget: { maxInputTokens: 12000, maxModelCalls: 1 },
    });
    assertContextFits(context);
    const key = createHash("sha256").update(`${session.id}:${target.id}:${answer.id}`).digest("hex");
    let task = await startTask({ userId: auth.id, opportunityId: session.opportunity_id, task: "mock_interview", goal: "根据上一答生成下一题", context,
      idempotencyKey: `interview-next:${key}`, steps: [], estimate: { estimatedModelCalls: 1 } });
    scope = { userId: auth.id, runId: task.runId };
    if (task.reused) {
      const saved = await getTaskLedger(scope);
      if (saved.runStatus === "completed") return reply({ ok: true, question: saved.result });
      if (saved.runStatus !== "failed") return reply({ ok: false, error: "下一题正在生成或已取消，请稍后重试" }, 409);
      // A failed attempt has no usable result. Explicit retry keeps the original answer.
      task = await startTask({ userId: auth.id, opportunityId: session.opportunity_id, task: "mock_interview", goal: "重试承接上一答", context,
        idempotencyKey: `interview-next:${key}:retry:${typeof body.retryId === "string" && uuid.test(body.retryId) ? body.retryId : "first"}`,
        steps: [], estimate: { estimatedModelCalls: 1 } });
      scope = { userId: auth.id, runId: task.runId };
      if (task.reused) return reply({ ok: false, error: "重试正在执行或未完成，请保留回答并重新点击下一题" }, 409);
    }
    await startExecution({ ...scope, modelCallCount: 1 });
    const rendered = renderContextForPrompt(context, { excludeKinds: ["current_input", "question_source"] });
    const next = await runWithGenerationContext({ userId: auth.id, operation: "mock_interview_follow_up", requestId: task.runId }, () => generateLinkedFollowUpQuestion({
      sessionId: session.id, roundType: session.round_type as RoundType, previousQuestionId: previous.id, previousQuestion: previous.question_text,
      previousAnswer: answer.answer, contextText: rendered.text, warnings: rendered.warnings, sourceMaterials: interviewMaterials(context),
    }));
    if ((await getTaskLedger(scope)).runStatus === "cancelled") return reply({ ok: false, error: "生成已取消" }, 409);
    const question = { ...next, id: target.id, created_at: target.created_at,
      tips: { ...next.tips, _harness: { ordinal: nextOrdinal, sources: next.sources, linkage: next.linkage, previousAnswerId: answer.id } } };
    // Reject a concurrent replacement; never overwrite an answered/changed question silently.
    const update = await db.from("interview_questions").update({ question_text: question.question_text, tips: question.tips })
      .eq("id", target.id).eq("session_id", session.id).eq("question_text", target.question_text).select("id").maybeSingle();
    if (update.error) throw update.error;
    if (!update.data) throw Error("题目已变化，请刷新后重试");
    await completeTask({ ...scope, result: question, modelCallCount: 1 });
    return reply({ ok: true, question });
  } catch (error) {
    if (scope) await failTask({ ...scope, reason: "error", failureType: "interview_next_failed" }).catch(() => undefined);
    return reply({ ok: false, error: error instanceof Error ? error.message : "下一题生成失败，保留当前回答" }, 500);
  }
}
