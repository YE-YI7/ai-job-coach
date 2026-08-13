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
  actor: "agent" | "user" | "system";
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
  status: "accepted" | "pending" | "rejected";
}

export interface InterviewFocus {
  id: string;
  question: string;
  rationale: string;
  readiness: "ready" | "practice" | "missing";
}

export interface Opportunity {
  id: string;
  company: string;
  role: string;
  location: string;
  stage: OpportunityStage;
  stageLabel: string;
  priority: "high" | "medium" | "low";
  sourceLabel: string;
  capturedAtLabel: string;
  nextEventLabel: string | null;
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
}
