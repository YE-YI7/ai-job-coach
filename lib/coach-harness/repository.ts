import { getDbClient } from "@/lib/db";
import { createHash } from "node:crypto";
import { compileContextBundle } from "./context";
import type { ArtifactReference, ArtifactReviewStatus, ArtifactReviewType, CareerClaim, CoachActionType, CoachExecutor, ContextBundle, OpportunityContext, OpportunitySnapshotType } from "./types";
import type { Opportunity } from "@/lib/opportunities/types";
import { buildAgentKnowledgeContext, type AgentKnowledgeTask } from "@/lib/knowledge/context";

function requireDb(db: Awaited<ReturnType<typeof getDbClient>>) {
  if (!db) throw new Error("数据库不可用");
  return db;
}

type DbRow = Record<string, unknown>;

function contentHash(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

async function recordSource(input: {
  userId: string; opportunityId?: string | null; sourceType: "resume" | "user_answer" | "project_note" | "mock_interview" | "real_interview" | "application" | "jd" | "other";
  title: string; content: string; metadata?: Record<string, unknown>;
}) {
  const db = requireDb(await getDbClient());
  const hash = contentHash(input.content);
  const { data: existing, error: lookupError } = await db.from("coach_sources")
    .select("id").eq("user_id", input.userId).eq("content_hash", hash).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return { id: String(existing.id), hash };
  const { data, error } = await db.from("coach_sources").insert({
    user_id: input.userId, opportunity_id: input.opportunityId || null, source_type: input.sourceType,
    title: input.title, content: input.content, content_hash: hash, metadata: input.metadata || {},
  }).select("id").single();
  if (error) throw error;
  return { id: String(data.id), hash };
}

async function recordResumeClaims(input: {
  userId: string;
  opportunityId: string;
  sourceId: string;
  content: string;
  global: boolean;
}) {
  const db = requireDb(await getDbClient());
  if (!input.global) {
    const globalClaims = await db.from("coach_claims").select("entity_key")
      .eq("user_id", input.userId).eq("source_id", input.sourceId).is("opportunity_id", null).limit(1);
    if (globalClaims.error) throw globalClaims.error;
    if (globalClaims.data?.length) return;
  }
  let lookup = db.from("coach_claims").select("entity_key")
    .eq("user_id", input.userId).eq("source_id", input.sourceId);
  lookup = input.global ? lookup.is("opportunity_id", null) : lookup.eq("opportunity_id", input.opportunityId);
  const existing = await lookup;
  if (existing.error) throw existing.error;
  const existingKeys = new Set((existing.data || []).map((claim: { entity_key: unknown }) => String(claim.entity_key)));
  const rows = input.content.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 120).map((line) => ({
    user_id: input.userId,
    opportunity_id: input.global ? null : input.opportunityId,
    source_id: input.sourceId,
    entity_type: "experience",
    entity_key: `resume-${contentHash(line).slice(0, 20)}`,
    claim_type: "resume_source",
    value: line,
    display_text: line,
    source_excerpt: line,
    status: "confirmed",
    visibility: "recruiter_safe",
    confirmed_at: new Date().toISOString(),
  })).filter((row) => !existingKeys.has(row.entity_key));
  if (rows.length) {
    const { error } = await db.from("coach_claims").insert(rows);
    if (error) throw error;
  }
}

export async function createOpportunitySnapshot(input: {
  userId: string; opportunityId: string; snapshotType: OpportunitySnapshotType; title: string;
  content: unknown; sourceId?: string | null; artifactId?: string | null;
  createdBy?: "user" | "hosted_ai" | "personal_agent" | "system"; metadata?: Record<string, unknown>;
}) {
  const db = requireDb(await getDbClient());
  const hash = contentHash(input.content);
  const { data: existing, error: existingError } = await db.from("coach_opportunity_snapshots")
    .select("*").eq("user_id", input.userId).eq("opportunity_id", input.opportunityId)
    .eq("snapshot_type", input.snapshotType).eq("content_hash", hash).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;
  const { data: latest, error: latestError } = await db.from("coach_opportunity_snapshots")
    .select("version").eq("user_id", input.userId).eq("opportunity_id", input.opportunityId)
    .eq("snapshot_type", input.snapshotType).order("version", { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw latestError;
  const { data, error } = await db.from("coach_opportunity_snapshots").insert({
    user_id: input.userId, opportunity_id: input.opportunityId, snapshot_type: input.snapshotType,
    version: Number(latest?.version || 0) + 1, title: input.title, content: input.content,
    content_hash: hash, source_id: input.sourceId || null, artifact_id: input.artifactId || null,
    created_by: input.createdBy || "user", metadata: input.metadata || {},
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function createArtifactWithClaims(input: {
  userId: string; opportunityId: string; artifactType: "master_resume" | "target_resume" | "interview_plan" | "mock_interview" | "interview_review" | "application_answer" | "project_story" | "other";
  title: string; content: unknown; status?: "draft" | "needs_confirmation" | "confirmed" | "archived";
  contextSnapshot?: unknown; createdBy?: "user" | "hosted_ai" | "personal_agent" | "system";
  claimLinks?: Array<{ claimId: string; usagePath: string }>;
}) {
  const db = requireDb(await getDbClient());
  const { data: latest, error: latestError } = await db.from("coach_artifacts").select("id, version")
    .eq("user_id", input.userId).eq("opportunity_id", input.opportunityId).eq("artifact_type", input.artifactType)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw latestError;
  const { data, error } = await db.from("coach_artifacts").insert({
    user_id: input.userId, opportunity_id: input.opportunityId, artifact_type: input.artifactType,
    parent_id: latest?.id || null, version: Number(latest?.version || 0) + 1, title: input.title,
    content: input.content, status: input.status || "draft", context_snapshot: input.contextSnapshot || {},
    created_by: input.createdBy || "hosted_ai",
  }).select("*").single();
  if (error) throw error;
  const links = (input.claimLinks || []).filter((link) => link.claimId);
  if (links.length) {
    const { error: linkError } = await db.from("coach_artifact_claims").insert(links.map((link) => ({
      artifact_id: data.id, claim_id: link.claimId, usage_path: link.usagePath,
    })));
    if (linkError) throw linkError;
  }
  return data;
}

export async function recordArtifactReview(input: {
  userId: string; opportunityId: string; artifactId: string; reviewerType: ArtifactReviewType;
  status: ArtifactReviewStatus; summary: string; findings?: unknown[]; contextFingerprint?: string | null;
}) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_artifact_reviews").upsert({
    user_id: input.userId, opportunity_id: input.opportunityId, artifact_id: input.artifactId,
    reviewer_type: input.reviewerType, status: input.status, summary: input.summary,
    findings: input.findings || [], context_fingerprint: input.contextFingerprint || null,
  }, { onConflict: "artifact_id,reviewer_type" }).select("*").single();
  if (error) throw error;
  return data;
}

export async function listArtifactReviews(userId: string, opportunityId: string, artifactId: string) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_artifact_reviews").select("*")
    .eq("user_id", userId).eq("opportunity_id", opportunityId).eq("artifact_id", artifactId);
  if (error) throw error;
  return data || [];
}

export async function getArtifactForUser(userId: string, opportunityId: string, artifactId: string) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_artifacts").select("*")
    .eq("user_id", userId).eq("opportunity_id", opportunityId).eq("id", artifactId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("简历版本不存在");
  return data;
}

function knowledgeTask(task: CoachActionType): AgentKnowledgeTask {
  if (task === "job_decision" || task === "application_assist") return "job_analysis";
  if (task === "resume_workshop") return "resume_tailoring";
  if (task === "mock_interview") return "mock_interview";
  if (task === "interview_review") return "interview_review";
  return "career_coaching";
}

function mapClaim(row: DbRow): CareerClaim {
  return {
    id: String(row.id),
    entityType: row.entity_type as CareerClaim["entityType"],
    entityKey: String(row.entity_key),
    claimType: String(row.claim_type),
    value: row.value,
    displayText: String(row.display_text),
    sourceExcerpt: row.source_excerpt ? String(row.source_excerpt) : null,
    sourceId: row.source_id ? String(row.source_id) : null,
    status: row.status as CareerClaim["status"],
    visibility: row.visibility as CareerClaim["visibility"],
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function getContextBundleForUser(input: {
  userId: string;
  task: CoachActionType;
  opportunityId?: string | null;
}): Promise<ContextBundle> {
  const db = requireDb(await getDbClient());
  let opportunity: OpportunityContext | null = null;

  if (input.opportunityId) {
    const { data, error } = await db.from("coach_opportunities")
      .select("id, company, role, stage, jd_text, jd_version, scheduled_interview_at")
      .eq("id", input.opportunityId).eq("user_id", input.userId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("岗位不存在");
    opportunity = {
      id: String(data.id), company: String(data.company), role: String(data.role), stage: String(data.stage),
      jdText: data.jd_text ? String(data.jd_text) : null, jdVersion: Number(data.jd_version),
      scheduledInterviewAt: data.scheduled_interview_at ? String(data.scheduled_interview_at) : null,
    };
  }

  const { data: claimRows, error: claimError } = await db.from("coach_claims")
    .select("id, source_id, opportunity_id, entity_type, entity_key, claim_type, value, display_text, source_excerpt, status, visibility, updated_at")
    .eq("user_id", input.userId).order("updated_at", { ascending: false }).limit(500);
  if (claimError) throw claimError;

  const relevantClaims = ((claimRows || []) as DbRow[]).filter((row) =>
    !row.opportunity_id || row.opportunity_id === (input.opportunityId || null));

  const { data: artifactRows, error: artifactError } = await db.from("coach_artifacts")
    .select("id, opportunity_id, artifact_type, version, title, status, content, created_at")
    .eq("user_id", input.userId).order("created_at", { ascending: false }).limit(50);
  if (artifactError) throw artifactError;
  const relevantArtifacts = ((artifactRows || []) as DbRow[]).filter((row) =>
    !row.opportunity_id || row.opportunity_id === (input.opportunityId || null));

  let claimLinks: Record<string, string[]> = {};
  if (relevantArtifacts.length) {
    const { data: linkRows, error: linkError } = await db.from("coach_artifact_claims")
      .select("artifact_id, claim_id").in("artifact_id", relevantArtifacts.map((row) => row.id));
    if (linkError) throw linkError;
    claimLinks = ((linkRows || []) as DbRow[]).reduce((acc: Record<string, string[]>, row) => {
      const artifactId = String(row.artifact_id);
      acc[artifactId] = [...(acc[artifactId] || []), String(row.claim_id)];
      return acc;
    }, {});
  }

  const artifacts: ArtifactReference[] = relevantArtifacts.map((row) => ({
    id: String(row.id), artifactType: String(row.artifact_type), version: Number(row.version), title: String(row.title),
    status: String(row.status), content: row.content, claimIds: claimLinks[String(row.id)] || [], createdAt: String(row.created_at),
  }));

  const knowledge = await buildAgentKnowledgeContext({
    task: knowledgeTask(input.task),
    company: opportunity?.company,
    role: opportunity?.role,
    query: [opportunity?.company, opportunity?.role, opportunity?.jdText?.slice(0, 180), input.task].filter(Boolean).join(" "),
    limit: 6,
  });

  return compileContextBundle({
    task: input.task,
    userId: input.userId,
    opportunity,
    claims: relevantClaims.map(mapClaim),
    artifacts,
    knowledge: knowledge.items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      goal: item.goal,
      scope: item.scope,
      confidence: item.confidence,
      evidenceUrls: item.evidence.map((source) => source.url),
    })),
    knowledgeContext: knowledge.contextText,
  });
}

export async function listClaims(userId: string) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_claims").select("*").eq("user_id", userId)
    .neq("status", "withdrawn").order("updated_at", { ascending: false }).limit(500);
  if (error) throw error;
  return (data || []).map(mapClaim);
}

export async function createClaim(input: {
  userId: string; opportunityId?: string | null; sourceId?: string | null;
  entityType: CareerClaim["entityType"]; entityKey: string; claimType: string;
  value: unknown; displayText: string; sourceExcerpt?: string | null;
  status?: CareerClaim["status"]; visibility?: CareerClaim["visibility"];
}) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_claims").insert({
    user_id: input.userId, opportunity_id: input.opportunityId || null, source_id: input.sourceId || null,
    entity_type: input.entityType, entity_key: input.entityKey, claim_type: input.claimType,
    value: input.value, display_text: input.displayText, source_excerpt: input.sourceExcerpt || null,
    status: input.status || "unverified", visibility: input.visibility || "private",
    confirmed_at: input.status === "confirmed" ? new Date().toISOString() : null,
  }).select("*").single();
  if (error) throw error;
  return mapClaim(data);
}

export async function createCoachRun(input: {
  userId: string; opportunityId?: string | null; task: CoachActionType; executor: CoachExecutor;
  goal: string; payload?: Record<string, unknown>; context: ContextBundle; requiresConfirmation?: boolean;
}) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_runs").insert({
    user_id: input.userId, opportunity_id: input.opportunityId || null, action_type: input.task,
    executor: input.executor, goal: input.goal, input: input.payload || {}, context_snapshot: input.context,
    requires_confirmation: Boolean(input.requiresConfirmation),
  }).select("*").single();
  if (error) throw error;
  await db.from("coach_run_events").insert({ user_id: input.userId, run_id: data.id, event_type: "created", payload: { fingerprint: input.context.fingerprint } });
  return data;
}

export async function listCockpitOpportunities(userId: string): Promise<Opportunity[]> {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_opportunities").select("*").eq("user_id", userId)
    .eq("status", "active").order("updated_at", { ascending: false }).limit(100);
  if (error) throw error;
  const rows = (data || []) as DbRow[];
  const ids = rows.map((row) => String(row.id));
  const { data: snapshotRows, error: snapshotError } = ids.length
    ? await db.from("coach_opportunity_snapshots").select("id, opportunity_id, snapshot_type, version, title, frozen_at").in("opportunity_id", ids).order("version", { ascending: false })
    : { data: [], error: null };
  if (snapshotError) throw snapshotError;
  const { data: artifactRows, error: artifactError } = ids.length
    ? await db.from("coach_artifacts").select("id, opportunity_id, version").in("opportunity_id", ids).eq("artifact_type", "target_resume").order("version", { ascending: false })
    : { data: [], error: null };
  if (artifactError) throw artifactError;
  const latestArtifacts = new Map<string, DbRow>();
  for (const artifact of (artifactRows || []) as DbRow[]) if (!latestArtifacts.has(String(artifact.opportunity_id))) latestArtifacts.set(String(artifact.opportunity_id), artifact);
  const artifactIds = [...latestArtifacts.values()].map((artifact) => String(artifact.id));
  const { data: reviewRows, error: reviewError } = artifactIds.length
    ? await db.from("coach_artifact_reviews").select("artifact_id, reviewer_type, status, summary").in("artifact_id", artifactIds)
    : { data: [], error: null };
  if (reviewError) throw reviewError;
  return rows.map((row) => {
    const metadata = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Partial<Opportunity>;
    const opportunityId = String(row.id);
    const artifact = latestArtifacts.get(opportunityId);
    const reviews = ((reviewRows || []) as DbRow[]).filter((review) => String(review.artifact_id) === String(artifact?.id));
    const blocking = reviews.some((review) => review.status === "failed");
    const requiredPassed = ["facts", "ats", "independent_ai"].every((type) => reviews.some((review) => review.reviewer_type === type && review.status === "passed"));
    return {
      ...metadata,
      id: String(row.id),
      company: String(row.company),
      role: String(row.role),
      stage: String(row.stage) as Opportunity["stage"],
      jdText: row.jd_text ? String(row.jd_text) : undefined,
      location: metadata.location || "地点待确认",
      stageLabel: metadata.stageLabel || "评估中",
      priority: metadata.priority || "medium",
      sourceLabel: metadata.sourceLabel || "网页端",
      capturedAtLabel: metadata.capturedAtLabel || "已同步",
      nextEventLabel: metadata.nextEventLabel || null,
      scheduledInterviewAt: row.scheduled_interview_at ? String(row.scheduled_interview_at) : metadata.scheduledInterviewAt || null,
      recommendation: metadata.recommendation || "prepare_then_apply",
      recommendationLabel: metadata.recommendationLabel || "补充后投递",
      recommendationReason: metadata.recommendationReason || "等待补充证据。",
      evidenceCoverage: metadata.evidenceCoverage || { strong: 0, weak: 0, missing: 0, unverified: 0 },
      requirements: metadata.requirements || [],
      actions: metadata.actions || [],
      activities: metadata.activities || [],
      resumeChanges: metadata.resumeChanges || [],
      interviewFocus: metadata.interviewFocus || [],
      snapshots: ((snapshotRows || []) as DbRow[]).filter((snapshot) => String(snapshot.opportunity_id) === opportunityId).map((snapshot) => ({
        id: String(snapshot.id), snapshotType: snapshot.snapshot_type as NonNullable<Opportunity["snapshots"]>[number]["snapshotType"],
        version: Number(snapshot.version), title: String(snapshot.title), frozenAt: String(snapshot.frozen_at),
      })),
      applicationQuality: artifact ? {
        artifactId: String(artifact.id), version: Number(artifact.version), status: blocking ? "blocked" : requiredPassed ? "ready" : "draft",
        reviews: reviews.map((review) => ({ reviewerType: review.reviewer_type as NonNullable<Opportunity["applicationQuality"]>["reviews"][number]["reviewerType"], status: review.status as NonNullable<Opportunity["applicationQuality"]>["reviews"][number]["status"], summary: String(review.summary) })),
      } : undefined,
    };
  });
}

export async function createCockpitOpportunity(userId: string, opportunity: Omit<Opportunity, "id">) {
  const db = requireDb(await getDbClient());
  const { jdText, company, role, stage, scheduledInterviewAt, ...metadata } = opportunity;
  const { data, error } = await db.from("coach_opportunities").insert({
    user_id: userId,
    company,
    role,
    stage,
    jd_text: jdText || null,
    scheduled_interview_at: scheduledInterviewAt || null,
    metadata,
  }).select("*").single();
  if (error) throw error;
  const opportunityId = String(data.id);

  const sources = [
    jdText ? { type: "jd", title: `${company} · ${role} JD`, content: jdText } : null,
    opportunity.resumeText ? { type: "resume", title: `${role} 使用的简历`, content: opportunity.resumeText } : null,
    opportunity.profileText && !opportunity.resumeText ? { type: "other", title: "求职准备材料", content: opportunity.profileText } : null,
  ].filter(Boolean) as Array<{ type: "jd" | "resume" | "other"; title: string; content: string }>;

  for (const source of sources) {
    const sourceRow = await recordSource({ userId, opportunityId, sourceType: source.type, title: source.title, content: source.content });

    await createOpportunitySnapshot({
      userId, opportunityId, snapshotType: source.type === "jd" ? "jd" : "base_resume",
      title: source.title, content: { text: source.content }, sourceId: sourceRow.id, createdBy: "user",
    });

    if (source.type === "resume") await recordResumeClaims({
      userId,
      opportunityId,
      sourceId: sourceRow.id,
      content: source.content,
      global: opportunity.workspaceType === "preparation",
    });
  }

  return { ...opportunity, id: opportunityId } satisfies Opportunity;
}

export async function updateCockpitOpportunity(userId: string, opportunity: Opportunity) {
  const db = requireDb(await getDbClient());
  const { id, jdText, company, role, stage, scheduledInterviewAt, ...metadata } = opportunity;
  const { data: current, error: currentError } = await db.from("coach_opportunities").select("jd_text, jd_version, metadata")
    .eq("id", id).eq("user_id", userId).maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error("岗位不存在");
  const jdChanged = Boolean(jdText && jdText !== current.jd_text);
  const currentMetadata = current.metadata && typeof current.metadata === "object" ? current.metadata as Record<string, unknown> : {};
  const resumeChanged = Boolean(opportunity.resumeText && opportunity.resumeText !== currentMetadata.resumeText);
  const { error } = await db.from("coach_opportunities").update({
    company, role, stage, jd_text: jdText || null, scheduled_interview_at: scheduledInterviewAt || null,
    jd_version: jdChanged ? Number(current.jd_version) + 1 : Number(current.jd_version), metadata, updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
  if (jdChanged && jdText) {
    const source = await recordSource({ userId, opportunityId: id, sourceType: "jd", title: `${company} · ${role} JD`, content: jdText });
    await createOpportunitySnapshot({ userId, opportunityId: id, snapshotType: "jd", title: `${company} · ${role} JD`, content: { text: jdText }, sourceId: source.id, createdBy: "user" });
  }
  if (resumeChanged && opportunity.resumeText) {
    const source = await recordSource({ userId, opportunityId: id, sourceType: "resume", title: `${role} 使用的简历`, content: opportunity.resumeText });
    await createOpportunitySnapshot({ userId, opportunityId: id, snapshotType: "base_resume", title: `${role} 使用的简历`, content: { text: opportunity.resumeText }, sourceId: source.id, createdBy: "user" });
    await recordResumeClaims({ userId, opportunityId: id, sourceId: source.id, content: opportunity.resumeText, global: opportunity.workspaceType === "preparation" });
  }
}
