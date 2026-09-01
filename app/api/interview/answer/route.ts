/**
 * POST /api/interview/answer
 * 提交答案并获得评价
 * 
 * 请求体：
 * {
 *   "session_id": "uuid",
 *   "question_id": "uuid",
 *   "answer": "用户回答内容"
 * }
 * 
 * 响应：
 * {
 *   "question_id": "uuid",
 *   "assessment": {...}
 * }
 */

// 强制使用 Node.js runtime（禁止 Edge Runtime）
export const runtime = "nodejs";
export const preferredRegion = "iad1";

import { getDbClient, getLatestResumeByUserId } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { evaluateAnswer, formatResumeForPrompt } from "@/lib/interview/llm";
import { buildAgentKnowledgeContext } from "@/lib/knowledge/context";
import { runWithGenerationContext } from "@/lib/generation-context";
import {
  acquireInterviewGenerationClaim,
  completeInterviewGenerationClaim,
  releaseInterviewGenerationClaim,
} from "@/lib/interview-generation-claims";
import { v4 as uuidv4 } from "uuid";
import type {
  AnswerQuestionRequest,
  AnswerQuestionResponse,
  RoundType,
} from "@/lib/interview/types";

export async function POST(request: Request) {
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
    let body: AnswerQuestionRequest;
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
    const { session_id, question_id, answer, opportunityId } = body;
    if (!session_id || typeof session_id !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "缺少或无效的 session_id 字段" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    if (!question_id || typeof question_id !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "缺少或无效的 question_id 字段" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    if (!answer || typeof answer !== "string" || answer.trim().length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "缺少或无效的 answer 字段" }),
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

    // 5. 验证会话是否存在且属于当前用户
    const { data: session, error: sessionError } = await db
      .from("interview_sessions")
      .select("id, user_id, round_type, jd")
      .eq("id", session_id)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ ok: false, error: "面试会话不存在" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (session.user_id !== userId) {
      return new Response(
        JSON.stringify({ ok: false, error: "无权访问此面试会话" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 6. 验证题目是否存在且属于此会话
    const { data: question, error: questionError } = await db
      .from("interview_questions")
      .select("id, question_text")
      .eq("id", question_id)
      .eq("session_id", session_id)
      .single();

    if (questionError || !question) {
      return new Response(
        JSON.stringify({ ok: false, error: "题目不存在或不属于此会话" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 7. 查询用户简历数据（用于评估时参考）
    let resumeText = String(body.resumeText || "").trim().slice(0, 30_000);
    try {
      if (opportunityId) {
        const { data: opportunity, error: opportunityError } = await db.from("coach_opportunities")
          .select("id").eq("id", opportunityId).eq("user_id", userId).maybeSingle();
        if (opportunityError) throw opportunityError;
        if (!opportunity) return new Response(JSON.stringify({ ok: false, error: "岗位不存在" }), {
          status: 404, headers: { "Content-Type": "application/json" },
        });
      }
      if (!resumeText) {
        const resume = await getLatestResumeByUserId(userId);
        if (resume?.parsed) resumeText = formatResumeForPrompt(resume.parsed);
      }
    } catch (err) {
      console.warn("查询简历数据失败（非关键错误）:", err);
    }

    const knowledge = await buildAgentKnowledgeContext({
      task: "answer_assessment",
      query: `${session.round_type} ${question.question_text} ${session.jd.slice(0, 180)}`,
      limit: 5,
    });

    const claimKey = `answer:${session_id}:${question_id}`;
    const claim = await acquireInterviewGenerationClaim({
      key: claimKey,
      userId,
      sessionId: session_id,
      operation: "answer_assessment",
    });
    if (claim.state === "processing") {
      return new Response(JSON.stringify({ ok: false, error: "这道题正在生成反馈，请稍后重试" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (claim.state === "completed") {
      return new Response(JSON.stringify({ question_id, assessment: claim.result }), {
        status: 200,
        headers: { "Content-Type": "application/json", "x-yi-zhi-idempotent-replay": "true" },
      });
    }

    try {
      // 8. 评估答案（可能耗时 20-60 秒）
      const assessment = await runWithGenerationContext({
        userId,
        operation: "mock_interview_answer_assessment",
        requestId: claimKey,
        knowledgeDocumentIds: knowledge.items.map((item) => item.id),
      }, () => evaluateAnswer({
        question: question.question_text,
        jd: session.jd,
        answer: answer.trim(),
        roundType: session.round_type as RoundType,
        resumeText: resumeText || undefined,
        knowledgeContext: knowledge.contextText || undefined,
      }));

      // 9. 保存答案和评估到数据库
      const answerId = uuidv4();
      const { error: answerError } = await db
        .from("interview_answers")
        .insert({
          id: answerId,
          session_id: session_id,
          question_id: question_id,
          answer: answer.trim(),
          assessment: assessment,
          created_at: new Date().toISOString(),
        });

      if (answerError) throw new Error(`保存答案失败：${answerError.message}`);
      await completeInterviewGenerationClaim(claimKey, userId, assessment);

      // 10. 返回响应
      const response: AnswerQuestionResponse = {
        question_id: question_id,
        assessment: assessment,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      await releaseInterviewGenerationClaim(claimKey, userId).catch((releaseError) => {
        console.error("Release interview answer claim failed", releaseError);
      });
      throw error;
    }
  } catch (error) {
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
