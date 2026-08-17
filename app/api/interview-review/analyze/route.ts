/**
 * 面试复盘 - 分析 API
 * POST /api/interview-review/analyze
 *
 * 对解析后的每道题进行多角色讨论 + 打分 + 改写 + 整场汇总
 * 支持传入 session_id 自动保存到数据库
 */
import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { withMeteredAiRoute } from "@/lib/metered-ai-route";
import {
  analyzeQuestion,
  generateSummary,
  buildRolesUsed,
} from "@/lib/interview-review/analyzer";
import {
  selectRolesForRound,
  type ParsedQuestion,
  type QuestionAnalysisResult,
} from "@/lib/interview-review/types";
import { saveAnalysisResult } from "@/lib/interview-review/db";
import { buildAgentKnowledgeContext } from "@/lib/knowledge/context";

export const runtime = "nodejs";

async function handlePost(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const body = await req.json();
    const { questions, company, round, tags, resume_text, job_description, session_id } = body as {
      questions: ParsedQuestion[];
      company?: string;
      round?: string;
      tags?: string[];
      resume_text?: string;
      job_description?: string;
      session_id?: string;
    };

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json(
        { ok: false, error: "缺少面试题目数据" },
        { status: 400 }
      );
    }

    // 选择参与角色
    const roleIds = selectRolesForRound(round || "", tags || []);
    const knowledge = await buildAgentKnowledgeContext({
      task: "interview_review",
      company,
      query: `${round || ""} ${job_description?.slice(0, 180) || questions.slice(0, 2).map((item) => item.question).join(" ")}`,
      limit: 6,
    });

    // 逐题分析（串行，避免 API 限流）
    const analysisResults: QuestionAnalysisResult[] = [];
    for (const q of questions) {
      const result = await analyzeQuestion(q, roleIds, resume_text, job_description, knowledge.contextText);
      analysisResults.push(result);
    }

    // 生成整场汇总
    const summary = await generateSummary(
      analysisResults, company || "", round || "", job_description, resume_text, knowledge.contextText
    );

    const rolesUsed = buildRolesUsed(roleIds);

    // 持久化到数据库（如果提供了 session_id）
    if (session_id) {
      try {
        await saveAnalysisResult(session_id, analysisResults, summary, rolesUsed);
      } catch (e) {
        console.warn("保存分析结果到数据库失败（不影响返回）:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      analysis_results: analysisResults,
      summary,
      roles_used: rolesUsed,
    });
  } catch (err) {
    console.error("Interview review analyze error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

export const POST = withMeteredAiRoute(handlePost, { operation: "interview_review_analysis", quotaType: "interview" });
