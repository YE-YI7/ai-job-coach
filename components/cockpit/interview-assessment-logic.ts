/**
 * 模拟面试前端展示层纯逻辑。
 *
 * 这些函数只有一个职责：把后端返回的 InterviewAssessment / InterviewRoundSummary
 * 转成前端可以安全渲染的数据；一旦数据不足以支撑结论，就返回 null，
 * 让 UI 显示错误并允许重试，而不是补一个假分数。
 *
 * 这里不产生任何评价内容：不造分数、不造证据、不造下一步。
 */

import type { OpportunityAction } from "@/lib/opportunities/types";

export type InterviewAssessmentStatus = "assessed" | "needs_more_input";

export type InterviewAssessmentView = {
  status: InterviewAssessmentStatus;
  /** needs_more_input 时恒为 null，前端不得显示任何分数 */
  score: number | null;
  summary: string;
  evidence: string[];
  missingEvidence: string[];
  dimensions: Array<{ name: string; score?: number; comment: string }>;
  rewritePlan: string[];
  followUp: string;
  /** demo 表示示例反馈，不是真实模型输出 */
  source: "llm" | "demo";
};

export type InterviewDimensionView = { name: string; score: number; comment: string };

export type InterviewRoundNextActionView = {
  title: string;
  reason: string;
  doneWhen: string;
  priority: "urgent" | "high" | "normal";
};

export type InterviewRoundSummaryView = {
  overallScore: number;
  grade: string;
  verdict: string;
  strengths: string[];
  weaknesses: string[];
  dimensions: InterviewDimensionView[];
  questionBreakdown: Array<{ questionId: string; score: number | null; decisiveFinding: string }>;
  nextActions: InterviewRoundNextActionView[];
};

const MAX_ACTIONS = 3;
const MAX_STRINGS = 6;
const MAX_STRING_LENGTH = 1200;

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, MAX_STRINGS)
    .map((item) => item.slice(0, MAX_STRING_LENGTH));
}

function readScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readPriority(value: unknown): "urgent" | "high" | "normal" {
  return value === "urgent" || value === "high" || value === "normal" ? value : "normal";
}

/**
 * 把 /api/interview/answer 的 assessment 转成前端视图。
 *
 * - 返回 null：数据不可信，UI 必须报错 + 允许重试，禁止显示评分。
 * - assessed 但没有来自回答的证据：按工作包 A 合同降级为 needs_more_input。
 * - needs_more_input：score 强制为 null。
 */
export function normalizeInterviewAssessment(raw: unknown, source: "llm" | "demo" = "llm"): InterviewAssessmentView | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Record<string, unknown>;

  const declaredStatus = payload.status === "assessed" || payload.status === "needs_more_input" ? payload.status : null;
  const summary = typeof payload.summary === "string" ? payload.summary.trim().slice(0, MAX_STRING_LENGTH) : "";
  const evidence = readStringArray(payload.evidence);
  const missingEvidence = readStringArray(payload.missingEvidence);
  const rewritePlan = readStringArray(payload.rewritePlan);
  const followUp = typeof payload.followUp === "string" ? payload.followUp.trim().slice(0, MAX_STRING_LENGTH) : "";
  const dimensions = Array.isArray(payload.dimensions)
    ? payload.dimensions.slice(0, 8).map((item) => {
        const dimension = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const score = readScore(dimension.score);
        return {
          name: String(dimension.name || "反馈").slice(0, 40),
          ...(score === null ? {} : { score }),
          comment: String(dimension.comment || "").trim().slice(0, MAX_STRING_LENGTH),
        };
      }).filter((dimension) => dimension.comment.length > 0)
    : [];

  // 没有 status 也没有 summary：这是不可用的响应，不是"评过了"。
  if (!declaredStatus && !summary) return null;

  const score = readScore(payload.score);
  const wantsAssessment = declaredStatus === "assessed" || (declaredStatus === null && score !== null);

  // 声称评估过，但拿不出分数或证据 —— 不能当作已评分展示。
  if (wantsAssessment && (score === null || evidence.length === 0)) {
    return {
      status: "needs_more_input",
      score: null,
      summary: score === null
        ? "这次没有拿到可评分的结果，先补充后再评。"
        : "回答里没有可引用的事实，暂不评分。",
      evidence: [],
      missingEvidence: evidence.length === 0 ? ["回答中没有找到可引用的事实、数字或决策"] : [],
      dimensions,
      rewritePlan,
      followUp: followUp || "请补充一个具体事例：你当时做了什么、怎么判断的、结果是什么？",
      source,
    };
  }

  if (!wantsAssessment) {
    return {
      status: "needs_more_input",
      score: null,
      summary: summary || "信息不足，暂不评分。",
      evidence: [],
      missingEvidence: missingEvidence.length ? missingEvidence : ["回答中未提供具体事实或经历"],
      dimensions,
      rewritePlan,
      followUp: followUp || "请补充一个具体事例：你当时做了什么、怎么判断的、结果是什么？",
      source,
    };
  }

  return {
    status: "assessed",
    score,
    summary: summary || "已完成本题反馈。",
    evidence,
    missingEvidence,
    dimensions,
    rewritePlan,
    followUp,
    source,
  };
}

/**
 * needs_more_input 时给用户的具体补充提示：优先用缺口，其次重答提纲，最后追问。
 */
export function needsMoreInputHints(assessment: InterviewAssessmentView): string[] {
  if (assessment.status !== "needs_more_input") return [];
  const hints = [...assessment.missingEvidence, ...assessment.rewritePlan];
  if (!hints.length && assessment.followUp) hints.push(assessment.followUp);
  return hints.slice(0, 3);
}

/**
 * 把 /api/interview/summary 的响应转成前端视图。
 * 缺 overallScore 或 grade 时返回 null：宁可让用户重试，也不展示半份报告。
 */
export function normalizeRoundSummary(raw: unknown): InterviewRoundSummaryView | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Record<string, unknown>;
  const overallScore = readScore(payload.overallScore);
  const grade = typeof payload.grade === "string" ? payload.grade.trim().slice(0, 20) : "";
  if (overallScore === null || !grade) return null;

  const dimensions = Array.isArray(payload.dimensions)
    ? payload.dimensions.slice(0, 8).map((item) => {
        const dimension = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const score = readScore(dimension.score);
        return {
          name: String(dimension.name || "维度").slice(0, 20),
          // 维度分缺失时不用 overallScore 兜底，避免"看起来都有分"。
          score: score ?? 0,
          comment: String(dimension.comment || "").trim().slice(0, MAX_STRING_LENGTH),
        };
      }).filter((dimension) => dimension.comment.length > 0)
    : [];

  const questionBreakdown = Array.isArray(payload.questionBreakdown)
    ? payload.questionBreakdown.slice(0, 20).map((item) => {
        const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          questionId: String(entry.questionId || ""),
          score: readScore(entry.score),
          decisiveFinding: String(entry.decisiveFinding || "").trim().slice(0, MAX_STRING_LENGTH),
        };
      }).filter((entry) => entry.decisiveFinding.length > 0)
    : [];

  const nextActions = Array.isArray(payload.nextActions)
    ? payload.nextActions.slice(0, MAX_ACTIONS).map((item) => {
        const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          title: String(entry.title || "").trim().slice(0, 200),
          reason: String(entry.reason || "").trim().slice(0, MAX_STRING_LENGTH),
          doneWhen: String(entry.doneWhen || "").trim().slice(0, MAX_STRING_LENGTH),
          priority: readPriority(entry.priority),
        };
      }).filter((entry) => entry.title.length > 0)
    : [];

  return {
    overallScore,
    grade,
    verdict: typeof payload.verdict === "string" ? payload.verdict.trim().slice(0, MAX_STRING_LENGTH) : "",
    strengths: readStringArray(payload.strengths),
    weaknesses: readStringArray(payload.weaknesses),
    dimensions,
    questionBreakdown,
    nextActions,
  };
}

/**
 * 单题提交后的题号推进：只有 assessed 才推进，needs_more_input 停在原地。
 */
export function resolveNextStep(
  currentIndex: number,
  totalQuestions: number,
  status: InterviewAssessmentStatus,
): { currentIndex: number; completed: boolean } {
  if (status !== "assessed") return { currentIndex, completed: false };
  if (currentIndex >= totalQuestions - 1) return { currentIndex, completed: true };
  return { currentIndex: currentIndex + 1, completed: false };
}

/**
 * 整轮下一步 → 作战板行动项。最多 3 个。
 *
 * id 规则必须和 `POST /api/interview/complete`（写入 opportunity metadata.actions）保持一致，
 * 否则刷新后服务端那份和本地合并的那份会变成两条重复任务。
 */
export function toOpportunityActions(sessionId: string, nextActions: InterviewRoundNextActionView[]): OpportunityAction[] {
  return nextActions.slice(0, MAX_ACTIONS).map((action) => ({
    id: `interview-next-${sessionId}-${action.title.slice(0, 32)}`,
    title: action.title,
    reason: action.reason,
    dueLabel: action.doneWhen,
    priority: action.priority,
    status: "todo" as const,
  }));
}
