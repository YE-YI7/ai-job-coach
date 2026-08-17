import { createHash } from "node:crypto";
import { findClaimConflicts } from "./consistency";
import type {
  ArtifactReference,
  CareerClaim,
  CoachActionType,
  ContextBundle,
  OpportunityContext,
} from "./types";

const TASK_CLAIM_TYPES: Record<CoachActionType, Set<string>> = {
  job_decision: new Set(["profile", "experience", "project", "skill", "metric", "education", "preference"]),
  resume_workshop: new Set(["profile", "experience", "project", "skill", "metric", "education"]),
  project_deep_dive: new Set(["experience", "project", "skill", "metric"]),
  mock_interview: new Set(["profile", "experience", "project", "skill", "metric", "preference"]),
  interview_review: new Set(["experience", "project", "skill", "metric", "preference"]),
  follow_up: new Set(["profile", "preference"]),
  application_assist: new Set(["profile", "experience", "project", "skill", "metric", "education", "preference"]),
};

export function compileContextBundle(input: {
  task: CoachActionType;
  userId: string;
  opportunity?: OpportunityContext | null;
  claims: CareerClaim[];
  artifacts?: ArtifactReference[];
  knowledge?: ContextBundle["knowledge"];
  knowledgeContext?: string;
  now?: Date;
}): ContextBundle {
  const relevantTypes = TASK_CLAIM_TYPES[input.task];
  const claims = input.claims
    .filter((claim) => relevantTypes.has(claim.entityType))
    .filter((claim) => claim.status !== "withdrawn")
    .sort((a, b) => `${a.entityType}:${a.entityKey}:${a.id}`.localeCompare(`${b.entityType}:${b.entityKey}:${b.id}`));
  const artifacts = [...(input.artifacts || [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const knowledge = [...(input.knowledge || [])].sort((a, b) => a.id.localeCompare(b.id));
  const compiledAt = (input.now || new Date()).toISOString();
  const fingerprintPayload = {
    task: input.task,
    opportunity: input.opportunity
      ? { id: input.opportunity.id, jdVersion: input.opportunity.jdVersion, stage: input.opportunity.stage }
      : null,
    claims: claims.map((claim) => [claim.id, claim.status, claim.updatedAt || ""]),
    artifacts: artifacts.map((artifact) => [artifact.id, artifact.version, artifact.status]),
    knowledge: knowledge.map((item) => item.id),
  };

  return {
    version: 1,
    task: input.task,
    userId: input.userId,
    opportunity: input.opportunity || null,
    claims,
    artifacts,
    knowledge,
    knowledgeContext: input.knowledgeContext || "",
    allowedClaimIds: claims.filter((claim) => claim.status === "confirmed").map((claim) => claim.id),
    unverifiedClaimIds: claims.filter((claim) => claim.status === "unverified").map((claim) => claim.id),
    conflicts: findClaimConflicts(claims),
    compiledAt,
    fingerprint: createHash("sha256").update(JSON.stringify(fingerprintPayload)).digest("hex"),
  };
}
