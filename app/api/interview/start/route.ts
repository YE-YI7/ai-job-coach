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
import { buildAgentKnowledgeContext } from "@/lib/knowledge/context";
import { v4 as uuidv4 } from "uuid";
import { finalizeQuota, reserveQuota, type QuotaReservation } from "@/lib/quota";
import { runWithGenerationContext } from "@/lib/generation-context";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";
import type {
  RoundType,
  StartInterviewRequest,
  StartInterviewResponse,
} from "@/lib/interview/types";

const ALLOWED_ROUNDS = new Set<RoundType>(["业务面", "技术面", "HR面", "项目深挖", "总监面"]);

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
    if (opportunityId) {
      const { data: opportunity, error: opportunityError } = await db.from("coach_opportunities")
        .select("id, jd_text").eq("id", opportunityId).eq("user_id", userId).maybeSingle();
      if (opportunityError) throw opportunityError;
      if (!opportunity) return new Response(JSON.stringify({ ok: false, error: "岗位不存在" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
      effectiveJd = String(opportunity.jd_text || "").trim();
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
    let resumeText = useResume ? String(body.resumeText || "").trim().slice(0, 30_000) : "";
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
      }, () => generateInterviewQuestions(effectiveJd, roundType, questionCount, sessionId, resumeText, knowledge.contextText));
    } catch (generationError) {
      await db.from("interview_sessions").delete().eq("id", sessionId).eq("user_id", userId);
      throw generationError;
    }

    // 8. 保存题目到数据库
    if (questions.length > 0) {
      const questionsToInsert = questions.map((q) => ({
        id: q.id,
        session_id: sessionId,
        question_text: q.question_text,
        tips: q.tips,
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
