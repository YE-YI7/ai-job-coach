/**
 * POST /api/interview/start
 * 创建新的面试会话并生成面试题
 * 
 * 请求体：
 * {
 *   "jd": "职位描述",
 *   "roundType": "业务面",
 *   "questionCount": 5
 * }
 * 
 * 响应：
 * {
 *   "session_id": "uuid",
 *   "questions": [...]
 * }
 */

// 强制使用 Node.js runtime（禁止 Edge Runtime）
export const runtime = "nodejs";
export const preferredRegion = "iad1";

import { getDbClient, getLatestResumeByUserId } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { generateInterviewQuestions, formatResumeForPrompt } from "@/lib/interview/llm";
import { readCompanyResearch, renderCompanyResearch } from "@/lib/coach-harness/research-runtime";
import { buildInterviewStartContext, INTERVIEW_CAPACITY_MESSAGE } from "@/lib/interview/start-context";
import { buildAgentKnowledgeContext } from "@/lib/knowledge/context";
import {
  ContextBudgetExceededError,
} from "@/lib/coach-harness";
import { v4 as uuidv4 } from "uuid";
import { finalizeQuota, reserveQuota, type QuotaReservation } from "@/lib/quota";
import { getConfirmedInterviewClaims } from "@/lib/coach-harness/repository";
import { runWithGenerationContext } from "@/lib/generation-context";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";
import type {
  RoundType,
  StartInterviewRequest,
  StartInterviewResponse,
} from "@/lib/interview/types";

const ALLOWED_ROUNDS = new Set<RoundType>(["业务面", "技术面", "HR面", "项目深挖", "总监面"]);

function toKnowledgeItems(items: Array<Record<string, unknown>>) {
  return items.map((item) => ({
    id: String(item.id || crypto.randomUUID()),
    title: String(item.title || "知识片段"),
    description: String(item.description || ""),
    goal: String(item.goal || ""),
    scope: String(item.scope || ""),
    confidence: (["low", "medium", "high"].includes(String(item.confidence)) ? String(item.confidence) : "medium") as "low" | "medium" | "high",
    evidenceUrls: (Array.isArray(item.evidence) ? item.evidence : []).map((source) => String((source as Record<string, unknown>)?.url || "")).filter(Boolean),
  }));
}

export async function POST(request: Request) {
  let reservation: QuotaReservation | null = null;
  try {
    // 1. 鉴权：检查用户是否登录
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return new Response(
        JSON.stringify({ ok: false, error: "未认证" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    const userId = auth.id;

    // 2. 解析请求体
    let body: StartInterviewRequest;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: "无效的 JSON 请求体" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 3. 验证请求参数
    const { jd, roundType, questionCount, opportunityId } = body;
    const useResume = body.useResume !== false; // 默认使用简历
    if (!roundType || typeof roundType !== "string" || !ALLOWED_ROUNDS.has(roundType as RoundType)) {
      return new Response(
        JSON.stringify({ ok: false, error: "缺少或无效的 roundType 字段" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 10) {
      return new Response(
        JSON.stringify({ ok: false, error: "questionCount 必须是 1-10 的整数" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 4. 获取数据库客户端
    const db = await getDbClient();
    if (!db) {
      return new Response(
        JSON.stringify({ ok: false, error: "数据库连接失败" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let effectiveJd = typeof jd === "string" ? jd.trim() : "";
    let ownedResumeText = "";
    let companyResearch = "";
    if (opportunityId) {
      const { data: opportunity, error: opportunityError } = await db.from("coach_opportunities")
        .select("id, jd_text, company, role, metadata").eq("id", opportunityId).eq("user_id", userId).maybeSingle();
      if (opportunityError) throw opportunityError;
      if (!opportunity) return new Response(JSON.stringify({ ok: false, error: "岗位不存在" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
      // 以 DB 的 JD 为准；但 DB 为空而请求携带了 JD 时（客户端同步竞态），
      // 如实使用请求里的 JD，而不是报「缺 JD」却让用户对着页面上的 JD 快照发呆。
      const dbJd = String(opportunity.jd_text || "").trim();
      effectiveJd = dbJd || effectiveJd;
      ownedResumeText = typeof opportunity.metadata?.resumeText === "string" ? opportunity.metadata.resumeText.trim() : "";
      companyResearch = renderCompanyResearch(await readCompanyResearch(userId, opportunity).catch(() => null));
    }
    if (!effectiveJd) {
      return new Response(
        JSON.stringify({ ok: false, error: opportunityId ? "当前岗位还没有 JD，请先补充" : "缺少或无效的 jd 字段" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const requestId = String(body.requestId || crypto.randomUUID()).slice(0, 180);
    reservation = await reserveQuota(userId, "interview", `interview-start:${requestId}`);
    if (!reservation) {
      return new Response(JSON.stringify({ ok: false, error: "模拟面试额度不足", needUpgrade: true }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
    }

    // 5. 查询用户简历数据（用于个性化出题）
    let resumeText = useResume ? ownedResumeText || String(body.resumeText || "").trim() : "";
    if (useResume) {
      try {
        if (resumeText) console.log(`已加载当前岗位简历 (${resumeText.length} 字符)`);
        else {
        const resume = await getLatestResumeByUserId(userId);
        if (resume?.parsed) {
          resumeText = formatResumeForPrompt(resume.parsed);
          console.log(`已加载用户简历数据 (${resumeText.length} 字符)`);
        }
        }
      } catch (err) {
        console.warn("查询简历数据失败（非关键错误）:", err);
      }
    }

    const knowledge = await buildAgentKnowledgeContext({
      task: "mock_interview",
      query: `${roundType} ${effectiveJd.slice(0, 240)}`,
      limit: 6,
    });

    // Keep JD, résumé and every task-scoped confirmed fact verbatim. Capacity
    // follows the measured mandatory material; optional knowledge may degrade.
    const { context, rendered, sourceMaterials } = buildInterviewStartContext({
      userId,
      claims: await getConfirmedInterviewClaims(userId, opportunityId, { complete: true }),
      knowledge: toKnowledgeItems(knowledge.items as unknown as Array<Record<string, unknown>>),
      attachments: [
        { id: "interview-jd", label: "岗位 JD", text: effectiveJd, required: true },
        { id: "resume-text", label: "候选人简历", text: resumeText, required: Boolean(resumeText) },
        ...(companyResearch ? [{ id: "company-research", label: "公司公开调研（未交叉验证）", text: companyResearch, required: false }] : []),
      ],
    });
    console.info("Interview context compiled", {
      requestId, opportunityId: opportunityId || null,
      fingerprint: context.fingerprint, confirmedFacts: context.claims.length,
      inputBudget: context.budget.maxInputTokens,
      mandatoryExcluded: context.selection.excluded.filter(entry => entry.required).length,
    });

    // 6. 创建面试会话
    const sessionId = uuidv4();
    const { error: sessionError } = await db
      .from("interview_sessions")
      .insert({
        id: sessionId,
        user_id: userId,
        jd: effectiveJd,
        round_type: roundType,
        question_count: questionCount,
        opportunity_id: opportunityId || null,
        created_at: new Date().toISOString(),
      });

    if (sessionError) {
      await finalizeQuota(reservation, false);
      reservation = null;
      console.error("创建面试会话失败:", sessionError);
      return new Response(
        JSON.stringify({ ok: false, error: "创建面试会话失败" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 7. 生成面试题（可能耗时 30-120 秒）
    let questions;
    try {
      questions = await runWithGenerationContext({
        userId,
        operation: "mock_interview_start",
        requestId,
        knowledgeDocumentIds: knowledge.items.map((item) => item.id),
      }, () => generateInterviewQuestions({
        jd: effectiveJd,
        roundType,
        count: questionCount,
        sessionId,
        resumeText,
        knowledgeContext: knowledge.contextText,
        contextText: rendered.text,
        warnings: rendered.warnings,
        requireSourcing: true,
        sourceMaterials,
      }));
    } catch (generationError) {
      await db.from("interview_sessions").delete().eq("id", sessionId).eq("user_id", userId);
      throw generationError;
    }

    // 8. 保存题目到数据库
    if (questions.length > 0) {
      const questionsToInsert = questions.map((q, ordinal) => ({
        id: q.id,
        session_id: sessionId,
        question_text: q.question_text,
        tips: { ...q.tips, _harness: { ordinal, sources: q.sources, linkage: q.linkage || { kind: "session_opener" } } },
        created_at: q.created_at,
      }));

      const { error: questionsError } = await db
        .from("interview_questions")
        .insert(questionsToInsert);

      if (questionsError) {
        console.error("保存面试题失败:", questionsError);
        await db.from("interview_sessions").delete().eq("id", sessionId).eq("user_id", userId);
        throw new Error(`保存面试题失败：${questionsError.message}`);
      }
    }

    // 9. 返回响应
    const response: StartInterviewResponse = {
      session_id: sessionId,
      questions: questions,
    };

    await finalizeQuota(reservation, true);
    reservation = null;

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (reservation) await finalizeQuota(reservation, false).catch((refundError) => console.error("Interview quota refund failed", refundError));
    console.error("API Error:", error);
    // Log detailed compiler evidence above, not raw private fact IDs in the UI.
    // The archive is untouched; a true safety-cap failure still rejects generation.
    if (error instanceof ContextBudgetExceededError) {
      return new Response(
        JSON.stringify({ ok: false, code: "INTERVIEW_CONTEXT_CAPACITY",
          error: INTERVIEW_CAPACITY_MESSAGE, dataPreserved: true }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      );
    }
    const recovery = tokenPayRecoveryResponse(error);
    if (recovery) return recovery;
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "服务器内部错误",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
