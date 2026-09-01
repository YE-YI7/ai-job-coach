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

export interface Opportunity {
  id: string;
  workspaceType?: "job" | "preparation";
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
