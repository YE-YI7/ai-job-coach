/**
 * 模拟面试模块 - 类型定义
 */

// ========== 面试轮次类型 ==========
export type RoundType = "业务面" | "技术面" | "HR面" | "项目深挖" | "总监面";

// ========== 面试会话 ==========
export interface InterviewSession {
  id: string; // UUID
  user_id: string; // UUID, 关联 auth.users
  jd: string; // 职位描述（Job Description）
  round_type: RoundType; // 面试轮次类型
  question_count: number; // 题目数量
  created_at: string; // ISO timestamp
}

// ========== 面试题目提示信息 ==========
export interface Tips {
  intent: string; // 考察意图
  keyPoints: string[]; // 需要关注的关键点
  framework: string; // 回答框架
  industryNotes?: string; // 行业特性（可选）
  pitfalls?: string[]; // 需要避免的坑（可选）
  proTips?: string[]; // 内行窍门（可选）
}

// ========== 面试题目 ==========
export interface InterviewQuestion {
  id: string; // UUID
  session_id: string; // UUID, 关联 interview_sessions
  question_text: string; // 题目内容
  tips: Tips; // 提示信息（JSONB）
  created_at: string; // ISO timestamp
}

// ========== 评估结果（旧格式，保留兼容） ==========
export interface Assessment {
  accuracy: number; // 准确性 0-100
  grammar: number; // 语法 0-100
  detail?: number; // 细节 0-100 (可选)
  confidence: number; // 自信度 0-100
  tips: string; // 改进建议
  exemplarAnswer?: string; // 示范回答（可选）
}

// ========== 单题评价（工作包 A 合同） ==========
export interface InterviewAssessmentDimension {
  name: string;
  score?: number; // 重答建议和追问建议没有 score
  comment: string;
}

export type InterviewAssessmentStatus = "assessed" | "needs_more_input";

export interface InterviewAssessment {
  status: InterviewAssessmentStatus;
  score: number | null; // needs_more_input 时为 null
  summary: string;
  evidence: string[]; // 至少 1 条来自回答的证据
  missingEvidence: string[]; // 缺失或冲突
  dimensions: InterviewAssessmentDimension[];
  rewritePlan: string[];
  followUp: string;
}

// ========== 整轮总结（工作包 A 合同） ==========
export interface InterviewRoundSummaryQuestion {
  questionId: string;
  score: number;
  decisiveFinding: string;
}

export interface InterviewRoundNextAction {
  title: string;
  reason: string;
  doneWhen: string;
  priority: "urgent" | "high" | "normal";
}

export interface InterviewRoundSummary {
  overallScore: number;
  grade: string;
  verdict: string;
  strengths: string[];
  weaknesses: string[];
  dimensions: Array<{ name: string; score: number; comment: string }>;
  questionBreakdown: InterviewRoundSummaryQuestion[];
  nextActions: InterviewRoundNextAction[];
}

// ========== 面试答案 ==========
export interface InterviewAnswer {
  id: string; // UUID
  session_id: string; // UUID, 关联 interview_sessions
  question_id: string; // UUID, 关联 interview_questions
  answer: string; // 用户回答内容
  assessment: Assessment; // 评估结果（JSONB）
  created_at: string; // ISO timestamp
}

// ========== 面试总结 ==========
export interface InterviewSummary {
  session_id: string; // UUID
  overallScore: number; // 综合得分 0-100
  strengths: string[]; // 优势表现
  weaknesses: string[]; // 薄弱环节
  suggestions: string[]; // 改进建议
}

// ========== 生成面试题的输入参数 ==========
export interface GenerateInputs {
  jd: string; // 职位描述
  roundType: RoundType; // 面试轮次类型
  count: number; // 题目数量
}

// ========== API 请求/响应类型 ==========

// POST /api/interview/start 请求
export interface StartInterviewRequest {
  jd?: string;
  roundType: RoundType;
  questionCount: number;
  opportunityId?: string;
  resumeText?: string;
  requestId?: string;
  useResume?: boolean;
}

// POST /api/interview/start 响应
export interface StartInterviewResponse {
  session_id: string;
  questions: InterviewQuestion[];
}

// POST /api/interview/answer 请求
export interface AnswerQuestionRequest {
  session_id: string;
  question_id: string;
  answer: string;
  opportunityId?: string;
  resumeText?: string;
}

// POST /api/interview/answer 响应
export interface AnswerQuestionResponse {
  question_id: string;
  assessment: InterviewAssessment;
}

// GET /api/interview/summary 响应
export interface InterviewSummaryResponse {
  session_id: string;
  overallScore: number;
  grade: string;
  gradeNext: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  dimensions: { name: string; score: number; comment: string }[];
  questionBreakdown: InterviewRoundSummaryQuestion[];
  nextActions: InterviewRoundNextAction[];
}










