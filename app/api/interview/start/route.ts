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
import type {
  StartInterviewRequest,
  StartInterviewResponse,
  InterviewQuestion,
} from "@/lib/interview/types";

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
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, error: "无效的 JSON 请求体" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 3. 验证请求参数
    const { jd, roundType, questionCount } = body;
    const useResume = (body as any).useResume !== false; // 默认使用简历
    if (!jd || typeof jd !== "string" || jd.trim().length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "缺少或无效的 jd 字段" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    if (!roundType || typeof roundType !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "缺少或无效的 roundType 字段" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    if (!questionCount || typeof questionCount !== "number" || questionCount < 1) {
      return new Response(
        JSON.stringify({ ok: false, error: "缺少或无效的 questionCount 字段（必须 >= 1）" }),
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

    const requestId = String((body as any).requestId || crypto.randomUUID()).slice(0, 180);
    reservation = await reserveQuota(userId, "interview", `interview-start:${requestId}`);
    if (!reservation) {
      return new Response(JSON.stringify({ ok: false, error: "模拟面试额度不足", needUpgrade: true }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
    }

    // 5. 查询用户简历数据（用于个性化出题）
    let resumeText = "";
    if (useResume) {
      try {
        const resume = await getLatestResumeByUserId(userId);
        if (resume?.parsed) {
          resumeText = formatResumeForPrompt(resume.parsed);
          console.log(`已加载用户简历数据 (${resumeText.length} 字符)`);
        }
      } catch (err) {
        console.warn("查询简历数据失败（非关键错误）:", err);
      }
    }

    const knowledge = await buildAgentKnowledgeContext({
      task: "mock_interview",
      query: `${roundType} ${jd.slice(0, 240)}`,
      limit: 6,
    });

    // 6. 创建面试会话
    const sessionId = uuidv4();
    const { error: sessionError } = await db
      .from("interview_sessions")
      .insert({
        id: sessionId,
        user_id: userId,
        jd: jd.trim(),
        round_type: roundType,
        question_count: questionCount,
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
    const questions = await runWithGenerationContext({
      userId,
      operation: "mock_interview_start",
      requestId,
      knowledgeDocumentIds: knowledge.items.map((item) => item.id),
    }, () => generateInterviewQuestions(jd, roundType, questionCount, sessionId, resumeText, knowledge.contextText));

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
        // 不中断流程，继续返回响应
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
