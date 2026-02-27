/**
 * GET /api/interview/summary?session_id=xxx
 * 查看整轮面试总结
 * 
 * 查询参数：
 * - session_id: 面试会话ID
 * 
 * 响应：
 * {
 *   "session_id": "uuid",
 *   "overallScore": 75,
 *   "strengths": ["优势1", "优势2"],
 *   "weaknesses": ["薄弱点1", "薄弱点2"],
 *   "suggestions": ["建议1", "建议2"]
 * }
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { summarizeInterview } from "@/lib/interview/llm";
import type {
  InterviewSummaryResponse,
} from "@/lib/interview/types";

export async function GET(request: Request) {
  try {
    // 1. 鉴权：检查用户是否登录
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "未认证" },
        { status: 401 }
      );
    }

    // 2. 获取查询参数
    const { searchParams } = new URL(request.url);
    const session_id = searchParams.get("session_id");

    if (!session_id || typeof session_id !== "string") {
      return NextResponse.json(
        { ok: false, error: "缺少或无效的 session_id 查询参数" },
        { status: 400 }
      );
    }

    // 3. 获取数据库客户端
    const db = await getDbClient();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "数据库连接失败" },
        { status: 500 }
      );
    }

    // 4. 验证会话是否存在且属于当前用户，并获取 JD 和 round_type
    const { data: session, error: sessionError } = await db
      .from("interview_sessions")
      .select("id, user_id, jd, round_type")
      .eq("id", session_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { ok: false, error: "面试会话不存在" },
        { status: 404 }
      );
    }

    if (session.user_id !== userId) {
      return NextResponse.json(
        { ok: false, error: "无权访问此面试会话" },
        { status: 403 }
      );
    }

    // 5. 获取所有答案和评估
    const { data: answers, error: answersError } = await db
      .from("interview_answers")
      .select("assessment")
      .eq("session_id", session_id);

    if (answersError) {
      console.error("获取答案失败:", answersError);
      return NextResponse.json(
        { ok: false, error: "获取答案失败" },
        { status: 500 }
      );
    }

    // 6. 验证 assessments 不为空
    if (!answers || answers.length === 0 || !answers.some((a: any) => a.assessment)) {
      return NextResponse.json(
        { ok: false, error: "该面试会话还没有答案，无法生成总结" },
        { status: 400 }
      );
    }

    // 7. 提取所有 assessments
    const assessments = answers
      .map((a: any) => a.assessment)
      .filter((a: any) => a != null); // 过滤掉 null 或 undefined

    if (assessments.length === 0) {
      return NextResponse.json(
        { ok: false, error: "该面试会话的答案没有评估结果，无法生成总结" },
        { status: 400 }
      );
    }

    // 8. 调用 LLM 生成总结
    const summary = await summarizeInterview({
      jd: session.jd,
      roundType: session.round_type as any,
      assessments: assessments,
    });

    // 9. 返回响应
    const response: InterviewSummaryResponse = {
      session_id: session_id,
      overallScore: summary.overallScore,
      grade: summary.grade,
      gradeNext: summary.gradeNext,
      strengths: summary.strengths,
      weaknesses: summary.weaknesses,
      suggestions: summary.suggestions,
      dimensions: summary.dimensions,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "服务器内部错误",
      },
      { status: 500 }
    );
  }
}

