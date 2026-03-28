/**
 * 面试复盘 - 共享分析逻辑
 *
 * 从 analyze/route.ts 抽取，供 SSE 流式端点和批量端点共用
 */

import { callLLM } from "@/lib/llm";
import {
  getMultiRoleDiscussionPrompt,
  getAnswerRewritePrompt,
  getQuestionScorePrompt,
  getCoachSummaryPrompt,
} from "@/lib/interview-review/prompts";
import {
  REVIEW_ROLES,
  type ParsedQuestion,
  type QuestionAnalysisResult,
  type DiscussionTurn,
  type ReviewSummary,
  type ReviewRoleId,
} from "@/lib/interview-review/types";

// ==================== JSON 解析 ====================

/** 解析 JSON 响应，容错处理 */
export function parseJsonResponse(raw: string): any {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  // 尝试解析数组
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) return JSON.parse(arrMatch[0]);
  // 尝试解析对象
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) return JSON.parse(objMatch[0]);
  return null;
}

// ==================== 单题分析 ====================

/** 单题讨论结果（中间产物，供 SSE 逐条推送） */
export interface DiscussionResult {
  discussion: DiscussionTurn[];
  discussionSummary: string;
}

/** Step 1: 多角色讨论 */
export async function generateDiscussion(
  q: ParsedQuestion,
  roleIds: ReviewRoleId[],
  resumeText?: string,
  jobDescription?: string,
): Promise<DiscussionResult> {
  const discussionRaw = await callLLM(
    [
      { role: "system", content: "你是多角色面试复盘讨论的模拟器。严格输出JSON数组。" },
      {
        role: "user",
        content: getMultiRoleDiscussionPrompt(
          q.question, q.answer, roleIds, resumeText, q.index, jobDescription
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

  const discussionSummary = discussion
    .map(d => `${d.speaker}：${d.content}`)
    .join("\n");

  return { discussion, discussionSummary };
}

/** Step 2: 并行打分 + 改写 */
export async function scoreAndRewrite(
  q: ParsedQuestion,
  discussionSummary: string,
  resumeText?: string,
  jobDescription?: string,
): Promise<{ score: string; answerSkeleton: string[]; rewrittenAnswer: string }> {
  const [scoreRaw, rewriteRaw] = await Promise.all([
    callLLM(
      [
        { role: "system", content: "你是面试评分专家。只输出评级字母。" },
        {
          role: "user",
          content: getQuestionScorePrompt(q.question, q.answer, discussionSummary, jobDescription),
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
            q.question, q.answer, discussionSummary, resumeText, jobDescription
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

  return { score, answerSkeleton, rewrittenAnswer };
}

/** 完整单题分析（讨论 + 打分 + 改写） */
export async function analyzeQuestion(
  q: ParsedQuestion,
  roleIds: ReviewRoleId[],
  resumeText?: string,
  jobDescription?: string
): Promise<QuestionAnalysisResult> {
  // Step 1: 多角色讨论
  const { discussion, discussionSummary } = await generateDiscussion(
    q, roleIds, resumeText, jobDescription
  );

  // Step 2: 并行打分 + 改写
  const { score, answerSkeleton, rewrittenAnswer } = await scoreAndRewrite(
    q, discussionSummary, resumeText, jobDescription
  );

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

// ==================== 整场汇总 ====================

/** 从分析结果中提取汇总输入 */
export function buildSummaryInput(results: QuestionAnalysisResult[]) {
  return results.map(r => ({
    question: r.question,
    score: r.score,
    tags: r.tags,
    key_issues: r.discussion
      .filter(d => d.role_id === "consensus")
      .map(d => d.content)
      .join("; ") || "无",
  }));
}

/** 生成整场汇总 */
export async function generateSummary(
  analysisResults: QuestionAnalysisResult[],
  company: string,
  round: string,
  jobDescription?: string,
  resumeText?: string,
): Promise<ReviewSummary> {
  const summaryInput = buildSummaryInput(analysisResults);

  const summaryRaw = await callLLM(
    [
      { role: "system", content: "你是面试复盘总教练。严格输出JSON。" },
      {
        role: "user",
        content: getCoachSummaryPrompt(summaryInput, company, round, jobDescription, resumeText),
      },
    ],
    { temperature: 0.4, maxTokens: 1000, provider: "deepseek" }
  );

  try {
    const parsed = parseJsonResponse(summaryRaw);
    if (parsed) {
      return {
        overall_grade: parsed.overall_grade || "B",
        one_line_summary: parsed.one_line_summary || "分析完成",
        biggest_weakness: parsed.biggest_weakness || "",
        biggest_strength: parsed.biggest_strength || "",
        training_suggestions: Array.isArray(parsed.training_suggestions) ? parsed.training_suggestions : [],
        recommended_tags: Array.isArray(parsed.recommended_tags) ? parsed.recommended_tags : [],
      };
    }
  } catch {
    // fallthrough to default
  }

  return {
    overall_grade: "B",
    one_line_summary: "面试分析完成",
    biggest_weakness: "需要整体提升",
    biggest_strength: "已完成面试",
    training_suggestions: ["回顾每道题的专家点评", "针对弱点进行专项练习"],
    recommended_tags: [],
  };
}

// ==================== 角色信息 ====================

/** 构建角色信息列表（供 SSE roles 事件） */
export function buildRolesUsed(roleIds: ReviewRoleId[]) {
  return roleIds.map(id => ({
    id,
    name: REVIEW_ROLES[id].name,
    tag: REVIEW_ROLES[id].tag,
  }));
}
