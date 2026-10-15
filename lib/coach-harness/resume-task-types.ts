import type { ResumeChange, Opportunity } from "@/lib/opportunities/types";

export type ResumeQuestionField = "context" | "action" | "deliverable" | "outcome" | "scope";
export interface ResumeAgentQuestion {
  id: string;
  sourceExcerpt: string;
  question: string;
  field: ResumeQuestionField;
}
export interface ResumeAgentAnswer extends ResumeAgentQuestion {
  answer: string;
  skipped?: boolean;
  savedAt: string;
  claimId?: string;
}
export interface ResumeAgentTask {
  id: string;
  state: "idle" | "running" | "needs_detail" | "ready" | "failed" | "stale";
  question: ResumeAgentQuestion | null;
  answers: ResumeAgentAnswer[];
  updatedAt: string;
  error?: string;
  result?: { changes: ResumeChange[]; applicationQuality?: Opportunity["applicationQuality"]; resumeGenerationId?: string; resumeCheckStale?:boolean };
}

/** 不把待回答、模型推断或“暂不补充”变成经历事实。 */
export function factualResumeAnswers(answers: ResumeAgentAnswer[]) {
  return answers.filter(item => !item.skipped && item.answer.trim());
}

export function nextResumeQuestion(source: string, raw: unknown, answers: ResumeAgentAnswer[]): ResumeAgentQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const sourceExcerpt = String(value.sourceExcerpt || "").trim();
  const question = String(value.question || "").trim();
  const field = String(value.field || "action") as ResumeQuestionField;
  if (!["context", "action", "deliverable", "outcome", "scope"].includes(field)
    || !sourceExcerpt || sourceExcerpt.length > 260 || !source.includes(sourceExcerpt)
    || /@|https?:|电话|邮箱|手机|\d{11}/.test(sourceExcerpt)
    || question.length < 8 || question.length > 220 || (question.match(/[？?]/g) || []).length > 1
    || /https?:|@|\d{11}/.test(question)) return null;
  // 同一处的同一事实维度最多问一次；答“不知道”也算已经回答，不追着索取数字。
  if (answers.some(answer => (answer.field === field && answer.sourceExcerpt === sourceExcerpt) || answer.question === question)) return null;
  const id = `${field}:${encodeURIComponent(sourceExcerpt)}`;
  return { id, sourceExcerpt, question, field };
}
