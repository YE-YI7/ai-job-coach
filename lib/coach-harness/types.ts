export type CoachActionType =
  | "job_decision"
  | "resume_workshop"
  | "project_deep_dive"
  | "mock_interview"
  | "interview_review"
  | "follow_up"
  | "application_assist";

export type CoachExecutor = "hosted_api" | "personal_agent" | "browser_extension";
export type ClaimStatus = "confirmed" | "unverified" | "conflicted" | "withdrawn";
export type ClaimVisibility = "private" | "recruiter_safe" | "public";

export interface CareerClaim {
  id: string;
  entityType: "profile" | "experience" | "project" | "skill" | "metric" | "preference" | "education";
  entityKey: string;
  claimType: string;
  value: unknown;
  displayText: string;
  sourceExcerpt?: string | null;
  sourceId?: string | null;
  status: ClaimStatus;
  visibility: ClaimVisibility;
  updatedAt?: string;
}

export interface OpportunityContext {
  id: string;
  company: string;
  role: string;
  stage: string;
  jdText?: string | null;
  jdVersion: number;
  scheduledInterviewAt?: string | null;
}

export interface ArtifactReference {
  id: string;
  artifactType: string;
  version: number;
  title: string;
  status: string;
  content: unknown;
  claimIds: string[];
  createdAt: string;
}

export interface ContextBundle {
  version: 1;
  task: CoachActionType;
  userId: string;
  opportunity: OpportunityContext | null;
  claims: CareerClaim[];
  artifacts: ArtifactReference[];
  allowedClaimIds: string[];
  unverifiedClaimIds: string[];
  conflicts: Array<{ entityKey: string; claimIds: string[] }>;
  compiledAt: string;
  fingerprint: string;
}

export interface ArtifactSectionDraft {
  path: string;
  content: string;
  claimIds: string[];
}

export interface ArtifactDraft {
  artifactType: string;
  sections: ArtifactSectionDraft[];
}

export interface ConsistencyIssue {
  code: "unknown_claim" | "unconfirmed_claim" | "conflicted_claim" | "unsupported_number" | "empty_provenance";
  severity: "error" | "warning";
  path: string;
  message: string;
  claimIds?: string[];
  token?: string;
}

export interface ConsistencyReport {
  ok: boolean;
  issues: ConsistencyIssue[];
  referencedClaimIds: string[];
  checkedAt: string;
}

export type CoachRunStatus =
  | "queued"
  | "planning"
  | "running"
  | "awaiting_user"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export interface CoachRun {
  id: string;
  userId: string;
  opportunityId: string | null;
  actionType: CoachActionType;
  executor: CoachExecutor;
  status: CoachRunStatus;
  goal: string;
  input: Record<string, unknown>;
  contextSnapshot?: ContextBundle;
  output?: unknown;
  requiresConfirmation: boolean;
}
