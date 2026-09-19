import type { OfferMetrics } from "@/lib/offer/compare";

export type OpportunityStage =
  | "captured"
  | "evaluating"
  | "preparing_application"
  | "applied"
  | "interviewing"
  | "negotiating"
  | "won"
  | "lost"
  | "withdrawn"
  | "archived";

export type EvidenceStrength = "strong" | "weak" | "missing" | "unverified";
export type ActionStatus = "todo" | "done" | "snoozed";
export type OpportunityRecommendation = "apply" | "prepare_then_apply" | "skip";

export interface RequirementEvidence {
  id: string;
  requirement: string;
  importance: "critical" | "important" | "supporting";
  strength: EvidenceStrength;
  evidence: string;
  source: string | null;
  verified: boolean;
}

export interface OpportunityAction {
  id: string;
  title: string;
  reason: string;
  dueLabel: string;
  priority: "urgent" | "high" | "normal";
  status: ActionStatus;
}

export interface OpportunityActivity {
  id: string;
  actor: "analysis" | "user" | "system";
  title: string;
  detail: string;
  timeLabel: string;
}

export interface ResumeChange {
  id: string;
  section: string;
  before: string;
  after: string;
  reason: string;
  evidenceId: string | null;
  evidenceIds?: string[];
  editedByUser?: boolean;
  status: "accepted" | "pending" | "rejected";
}

export interface InterviewFocus {
  id: string;
  question: string;
  rationale: string;
  readiness: "ready" | "practice" | "missing";
}

export interface InterviewReviewReport {
  id: string;
  round: string;
  grade: string;
  overallComment: string;
  strengths: string[];
  improvements: string[];
  actions: string[];
  sourceNotes: string;
  createdAt: string;
}

export interface InterviewPracticeFeedback {
  id: string;
  question: string;
  answer: string;
  verdict: "可继续追问" | "证据不足" | "表达失焦";
  summary: string;
  strengths: string[];
  gaps: string[];
  followUp: string;
  improvedOutline: string[];
  createdAt: string;
}

export interface InterviewRoundtableAssessment {
  score: number;
  summary: string;
  dimensions: Array<{ name: string; score?: number; comment: string }>;
}

export interface InterviewRoundtableTurn {
  questionId: string;
  question: string;
  rationale?: string;
  answer?: string;
  assessment?: InterviewRoundtableAssessment;
}

export interface InterviewRoundtableSession {
  id: string;
  round: string;
  status: "running" | "completed";
  currentIndex: number;
  turns: InterviewRoundtableTurn[];
  createdAt: string;
  summary?: {
    overallScore: number;
    grade: string;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
  };
}

/** 单个 offer 的输入回显 + 计算结果摘要（口径见 lib/offer/compare.ts 顶部注释） */
export interface OfferSnapshot {
  name: string;
  cityLabel?: string;
  /** 税前月薪（元） */
  monthlySalary: number;
  /** 发放月数，如 12/13/14/16 */
  monthsPaid: number;
  /** 年终奖（元，税前）。months 模式已折算为 月薪×倍数 */
  yearEndBonus: number;
  /** 签字费（元），仅首年口径 */
  signingFee: number;
  /** 期权/股票年化税前（元/年） */
  equityAnnualPreTax: number;
  /** 每周工作小时 */
  weeklyHours: number;
  /** 计算结果摘要，复用 lib/offer/compare 的 OfferMetrics 字段 */
  computed: Pick<
    OfferMetrics,
    | "grossAnnualPackage"
    | "firstYearGrossPackage"
    | "monthlyNet"
    | "annualSalaryTax"
    | "bonusTax"
    | "annualDeduction"
    | "annualNet"
    | "hourlyNet"
    | "firstYearTotalNet"
  >;
}

/** 保存进作战盘的 offer 对比快照 */
export interface OfferComparison {
  offers: OfferSnapshot[];
  /** 服务端计算时间（ISO 8601） */
  computedAt: string;
  note?: string;
}

export interface Opportunity {
  id: string;
  workspaceType?: "job" | "preparation" | "offer";
  /** workspaceType === "offer" 时携带的对比快照（经 metadata jsonb 往返） */
  offerComparison?: OfferComparison;
  company: string;
  role: string;
  location: string;
  stage: OpportunityStage;
  stageLabel: string;
  priority: "high" | "medium" | "low";
  sourceLabel: string;
  capturedAtLabel: string;
  jdText?: string;
  resumeText?: string;
  profileText?: string;
  nextEventLabel: string | null;
  scheduledInterviewAt?: string | null;
  recommendation: OpportunityRecommendation;
  recommendationLabel: string;
  recommendationReason: string;
  evidenceCoverage: {
    strong: number;
    weak: number;
    missing: number;
    unverified: number;
  };
  requirements: RequirementEvidence[];
  actions: OpportunityAction[];
  activities: OpportunityActivity[];
  resumeChanges: ResumeChange[];
  interviewFocus: InterviewFocus[];
  interviewPractices?: InterviewPracticeFeedback[];
  mockInterviews?: InterviewRoundtableSession[];
  reviewReports?: InterviewReviewReport[];
  mentorSnoozes?: Array<{ actionId: string; until: string }>;
  snapshots?: Array<{
    id: string;
    snapshotType: "jd" | "base_resume" | "submitted_resume" | "application_answers" | "interview_brief" | "interview_feedback" | "outcome";
    version: number;
    title: string;
    frozenAt: string;
  }>;
  applicationQuality?: {
    artifactId: string;
    version: number;
    status: "draft" | "ready" | "blocked";
    reviews: Array<{
      reviewerType: "independent_ai" | "facts" | "ats" | "pdf";
      status: "passed" | "warning" | "failed" | "not_run";
      summary: string;
    }>;
  };
}
