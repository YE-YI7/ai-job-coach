import { getDbClient } from "@/lib/db";
import { createHash } from "node:crypto";
import { compileContextBundle } from "./context";
import type { ArtifactReference, CareerClaim, CoachActionType, CoachExecutor, ContextBundle, OpportunityContext } from "./types";
import type { Opportunity } from "@/lib/opportunities/types";

function requireDb(db: Awaited<ReturnType<typeof getDbClient>>) {
  if (!db) throw new Error("数据库不可用");
  return db;
}

type DbRow = Record<string, unknown>;

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

  return compileContextBundle({
    task: input.task,
    userId: input.userId,
    opportunity,
    claims: relevantClaims.map(mapClaim),
    artifacts,
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
  return ((data || []) as DbRow[]).map((row) => {
    const metadata = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Partial<Opportunity>;
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
      recommendation: metadata.recommendation || "prepare_then_apply",
      recommendationLabel: metadata.recommendationLabel || "补充后投递",
      recommendationReason: metadata.recommendationReason || "等待补充证据。",
      evidenceCoverage: metadata.evidenceCoverage || { strong: 0, weak: 0, missing: 0, unverified: 0 },
      requirements: metadata.requirements || [],
      actions: metadata.actions || [],
      activities: metadata.activities || [],
      resumeChanges: metadata.resumeChanges || [],
      interviewFocus: metadata.interviewFocus || [],
    };
  });
}

export async function createCockpitOpportunity(userId: string, opportunity: Omit<Opportunity, "id">) {
  const db = requireDb(await getDbClient());
  const { jdText, company, role, stage, ...metadata } = opportunity;
  const { data, error } = await db.from("coach_opportunities").insert({
    user_id: userId,
    company,
    role,
    stage,
    jd_text: jdText || null,
    metadata,
  }).select("*").single();
  if (error) throw error;
  const opportunityId = String(data.id);

  const sources = [
    jdText ? { type: "jd", title: `${company} · ${role} JD`, content: jdText } : null,
    opportunity.resumeText ? { type: "resume", title: `${role} 使用的简历`, content: opportunity.resumeText } : null,
  ].filter(Boolean) as Array<{ type: "jd" | "resume"; title: string; content: string }>;

  for (const source of sources) {
    const hash = createHash("sha256").update(source.content).digest("hex");
    const { data: sourceRow, error: sourceError } = await db.from("coach_sources").upsert({
      user_id: userId, opportunity_id: opportunityId, source_type: source.type,
      title: source.title, content: source.content, content_hash: hash,
    }, { onConflict: "user_id,content_hash" }).select("id").single();
    if (sourceError) throw sourceError;

    if (source.type === "resume") {
      const rows = source.content.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 120).map((line, index) => ({
        user_id: userId, opportunity_id: opportunityId, source_id: sourceRow.id,
        entity_type: "experience", entity_key: `resume-line-${index + 1}`,
        claim_type: "resume_source", value: line, display_text: line, source_excerpt: line,
        status: "confirmed", visibility: "recruiter_safe", confirmed_at: new Date().toISOString(),
      }));
      if (rows.length) {
        const { error: claimError } = await db.from("coach_claims").insert(rows);
        if (claimError) throw claimError;
      }
    }
  }

  return { ...opportunity, id: opportunityId } satisfies Opportunity;
}

export async function updateCockpitOpportunity(userId: string, opportunity: Opportunity) {
  const db = requireDb(await getDbClient());
  const { id, jdText, company, role, stage, ...metadata } = opportunity;
  const { error } = await db.from("coach_opportunities").update({
    company, role, stage, jd_text: jdText || null, metadata, updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
}
