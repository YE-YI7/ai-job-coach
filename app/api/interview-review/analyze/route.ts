/**
 * 面试复盘 - 分析 API
 * POST /api/interview-review/analyze
 * 
 * 对解析后的每道题进行多角色讨论 + 打分 + 改写 + 整场汇总
 * 支持传入 session_id 自动保存到数据库
 */
import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  getMultiRoleDiscussionPrompt,
  getAnswerRewritePrompt,
  getQuestionScorePrompt,
  getCoachSummaryPrompt,
} from "@/lib/interview-review/prompts";
import {
  selectRolesForRound,
  REVIEW_ROLES,
  type ParsedQuestion,
  type QuestionAnalysisResult,
  type DiscussionTurn,
  type ReviewSummary,
  type ReviewRoleId,
} from "@/lib/interview-review/types";
import { saveAnalysisResult } from "@/lib/interview-review/db";

export const runtime = "nodejs";

/** 解析 JSON 响应，容错处理 */
function parseJsonResponse(raw: string): any {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  // 尝试解析数组
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) return JSON.parse(arrMatch[0]);
  // 尝试解析对象
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) return JSON.parse(objMatch[0]);
  return null;
}

/** 分析单道题：讨论 + 打分 + 改写 */
async function analyzeQuestion(
  q: ParsedQuestion,
  roleIds: ReviewRoleId[],
  resumeText?: string
): Promise<QuestionAnalysisResult> {
  // Step 1: 多角色讨论
  const discussionRaw = await callLLM(
    [
      { role: "system", content: "你是多角色面试复盘讨论的模拟器。严格输出JSON数组。" },
      {
        role: "user",
        content: getMultiRoleDiscussionPrompt(
          q.question, q.answer, roleIds, resumeText, q.index
        ),
      },
    ],
    { temperature: 0.6, maxTokens: 2000, provider: "deepseek", timeoutMs: 90000 }
  );

  let discussion: DiscussionTurn[] = [];
  try {
    const parsed = parseJsonResponse(discussionRaw);
    if (Array.isArray(parsed)) {
      discussion = parsed.map((d: any) => ({
        speaker: d.speaker || "未知",
        role_id: d.role_id || "consensus",
        content: d.content || "",
      }));
    }
  } catch {
    discussion = [{
      speaker: "系统",
      role_id: "consensus" as any,
      content: "讨论生成失败，请重试",
    }];
  }

  // 提取讨论摘要用于后续步骤
  const discussionSummary = discussion
    .map(d => `${d.speaker}：${d.content}`)
    .join("\n");

  // Step 2: 并行执行打分 + 改写
  const [scoreRaw, rewriteRaw] = await Promise.all([
    callLLM(
      [
        { role: "system", content: "你是面试评分专家。只输出评级字母。" },
        {
          role: "user",
          content: getQuestionScorePrompt(q.question, q.answer, discussionSummary),
        },
      ],
      { temperature: 0.2, maxTokens: 10, provider: "deepseek" }
    ),
    callLLM(
      [
        { role: "system", content: "你是面试辅导教练。严格输出JSON。" },
        {
          role: "user",
          content: getAnswerRewritePrompt(
            q.question, q.answer, discussionSummary, resumeText
          ),
        },
      ],
      { temperature: 0.5, maxTokens: 1500, provider: "deepseek", timeoutMs: 60000 }
    ),
  ]);

  // 解析打分
  const score = scoreRaw.trim().replace(/[^A-DSa-ds+\-]/g, "").toUpperCase() || "B";

  // 解析改写
  let answerSkeleton: string[] = [];
  let rewrittenAnswer = "";
  try {
    const rewriteParsed = parseJsonResponse(rewriteRaw);
    if (rewriteParsed) {
      answerSkeleton = Array.isArray(rewriteParsed.skeleton) ? rewriteParsed.skeleton : [];
      rewrittenAnswer = rewriteParsed.rewritten_answer || "";
    }
  } catch {
    rewrittenAnswer = "改写生成失败，请重试";
  }

  // 从讨论中提取训练建议
  const consensusTurn = discussion.find(d => d.role_id === "consensus");
  const trainingTasks = consensusTurn
    ? [consensusTurn.content]
    : ["根据专家讨论要点进行针对性练习"];

  return {
    question_index: q.index,
    question: q.question,
    answer: q.answer,
    tags: q.estimated_tags,
    score,
    discussion,
    answer_skeleton: answerSkeleton,
    rewritten_answer: rewrittenAnswer,
    training_tasks: trainingTasks,
  };
}

export async function POST(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const body = await req.json();
    const { questions, company, round, tags, resume_text, session_id } = body as {
      questions: ParsedQuestion[];
      company?: string;
      round?: string;
      tags?: string[];
      resume_text?: string;
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

    // 逐题分析（串行，避免 API 限流）
    const analysisResults: QuestionAnalysisResult[] = [];
    for (const q of questions) {
      const result = await analyzeQuestion(q, roleIds, resume_text);
      analysisResults.push(result);
    }

    // 生成整场汇总
    const summaryInput = analysisResults.map(r => ({
      question: r.question,
      score: r.score,
      tags: r.tags,
      key_issues: r.discussion
        .filter(d => d.role_id === "consensus")
        .map(d => d.content)
        .join("; ") || "无",
    }));

    const summaryRaw = await callLLM(
      [
        { role: "system", content: "你是面试复盘总教练。严格输出JSON。" },
        {
          role: "user",
          content: getCoachSummaryPrompt(summaryInput, company || "", round || ""),
        },
      ],
      { temperature: 0.4, maxTokens: 1000, provider: "deepseek" }
    );

    let summary: ReviewSummary | null = null;
    try {
      const parsed = parseJsonResponse(summaryRaw);
      if (parsed) {
        summary = {
          overall_grade: parsed.overall_grade || "B",
          one_line_summary: parsed.one_line_summary || "分析完成",
          biggest_weakness: parsed.biggest_weakness || "",
          biggest_strength: parsed.biggest_strength || "",
          training_suggestions: Array.isArray(parsed.training_suggestions) ? parsed.training_suggestions : [],
          recommended_tags: Array.isArray(parsed.recommended_tags) ? parsed.recommended_tags : [],
        };
      }
    } catch {
      summary = {
        overall_grade: "B",
        one_line_summary: "面试分析完成",
        biggest_weakness: "需要整体提升",
        biggest_strength: "已完成面试",
        training_suggestions: ["回顾每道题的专家点评", "针对弱点进行专项练习"],
        recommended_tags: [],
      };
    }

    const rolesUsed = roleIds.map(id => ({
      id,
      name: REVIEW_ROLES[id].name,
      tag: REVIEW_ROLES[id].tag,
    }));

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
