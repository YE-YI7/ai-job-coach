/**
 * POST /api/interview/complete
 * 完成面试会话并生成总结
 * 
 * 请求体：
 * {
 *   "session_id": "uuid"
 * }
 * 
 * 响应：
 * {
 *   "session_id": "uuid",
 *   "summary": {
 *     "overallScore": 85,
 *     "strengths": [...],
 *     "weaknesses": [...],
 *     "suggestions": [...]
 *   }
 * }
 */

// 强制使用 Node.js runtime（禁止 Edge Runtime）
export const runtime = "nodejs";
export const preferredRegion = "iad1";

import { getDbClient } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { summarizeInterview } from "@/lib/interview/llm";
import { runWithGenerationContext } from "@/lib/generation-context";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";
import {
  acquireInterviewGenerationClaim,
  completeInterviewGenerationClaim,
  releaseInterviewGenerationClaim,
} from "@/lib/interview-generation-claims";

interface CompleteRequest {
  session_id: string;
}

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
    let body: CompleteRequest;
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
    const { session_id } = body;
    if (!session_id || typeof session_id !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "缺少或无效的 session_id 字段" }),
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

    // 6. 查询该会话的所有答案和评估结果
    const { data: answers, error: answersError } = await db
      .from("interview_answers")
      .select("assessment")
      .eq("session_id", session_id)
      .order("created_at", { ascending: true });

    if (answersError) {
      console.error("查询答案失败:", answersError);
      return new Response(
        JSON.stringify({ ok: false, error: "查询答案失败" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!answers || answers.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "该会话还没有任何答案" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 7. 提取所有评估结果
    const assessments = answers.map((a: any) => a.assessment || a);

    const claimKey = `summary:${session_id}`;
    const claim = await acquireInterviewGenerationClaim({
      key: claimKey,
      userId,
      sessionId: session_id,
      operation: "session_summary",
    });
    if (claim.state === "processing") {
      return new Response(JSON.stringify({ ok: false, error: "总结正在生成，请稍后重试" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (claim.state === "completed") {
      return new Response(JSON.stringify(claim.result), {
        status: 200,
        headers: { "Content-Type": "application/json", "x-yi-zhi-idempotent-replay": "true" },
      });
    }

    try {
      // 8. 生成面试总结（可能耗时 20-60 秒）
      const summary = await runWithGenerationContext({
        userId,
        operation: "mock_interview_summary",
        requestId: claimKey,
      }, () => summarizeInterview({
        jd: session.jd,
        roundType: session.round_type as any,
        assessments: assessments,
      }));

      // 9. 返回响应（兼容前端期望的格式：data.payload?.summary || data）
      const responseWithPayload = {
        type: "session-summary",
        payload: {
          session_id: session_id,
          summary: summary,
        },
        meta: {
          source: "llm",
          generated_at: new Date().toISOString(),
        },
      };
      await completeInterviewGenerationClaim(claimKey, userId, responseWithPayload);

      return new Response(JSON.stringify(responseWithPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      await releaseInterviewGenerationClaim(claimKey, userId).catch((releaseError) => {
        console.error("Release interview summary claim failed", releaseError);
      });
      throw error;
    }
  } catch (error) {
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
