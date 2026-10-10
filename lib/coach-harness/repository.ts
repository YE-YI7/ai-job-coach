import { getDbClient } from "@/lib/db";
import { createHash } from "node:crypto";
import { compileContextBundle } from "./context";
import { resumeSourceLines } from "./resume-recovery";
import { readReviewFindings, resumeQualityStatus } from "./resume-quality-state";
import { assertRunTransition, isTerminalRunStatus, isValidStopReason, normalizeRunStatus } from "./state-machine";
import type { CoachRunStatus, CoachStopReason } from "./types";
import type {
  ArtifactReference,
  ArtifactReviewStatus,
  ArtifactReviewType,
  CareerClaim,
  CoachActionType,
  CoachExecutor,
  ContextAttachment,
  ContextBudget,
  ContextBundle,
  OpportunityContext,
  OpportunitySnapshotType,
  RouteClass,
  SourceKind,
  VerificationLevel,
} from "./types";
import type { Opportunity } from "@/lib/opportunities/types";
import { STAGE_STATUS_WORDS } from "@/lib/opportunities/timeline";
import { buildAgentKnowledgeContext, type AgentKnowledgeTask } from "@/lib/knowledge/context";
import type { CompanyTier } from "./subagents/verification";
import {
  parseTierIntent,
  readTierPreference,
  sameTierSet,
  tierLabels,
  TIER_PREFERENCE_CLAIM_TYPE,
  TIER_PREFERENCE_KEY,
  type TierPreferenceState,
} from "@/lib/jobs/tier-intent";
import {
  decisionClaimRow, decisionEntityKey, decisionFromValue, JOB_DECISION_CLAIM_TYPE, type JobDecision,
} from "@/lib/jobs/job-decision";

export function requireDb(db: Awaited<ReturnType<typeof getDbClient>>) {
  if (!db) throw new Error("数据库不可用");
  return db;
}

/** Interview phases reuse owned confirmed facts; another job's facts never enter. */
export async function getConfirmedInterviewClaims(userId: string, opportunityId?: string | null): Promise<CareerClaim[]> {
  const db = requireDb(await getDbClient());
  let query = db.from("coach_claims").select(CLAIM_COLUMNS).eq("user_id", userId).eq("status", "confirmed");
  query = scopeToUserAndOpportunity(query, opportunityId || null, (q, expression)=>q.or(expression), q=>q.is("opportunity_id",null));
  const {data,error} = await query.order("updated_at",{ascending:false}).limit(301);
  if(error)throw error;
  if((data||[]).length>300)throw new Error("已确认事实较多，本轮无法完整读取；请缩小练习范围，原材料仍已保存。");
  return ((data||[]) as DbRow[]).map(mapClaim);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PRD §6.2：禁止从模型参数或请求正文信任 user_id。
 * 关联对象也要带 owner 约束，避免「对象属于自己、关联对象属于别人」。
 */
export function assertUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) throw new Error(`${label} 无效`);
  return value;
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
  const rows = resumeSourceLines(input.content).map(({ text: line, supplement: selfReportedSupplement }) => ({
    user_id: input.userId,
    opportunity_id: input.global ? null : input.opportunityId,
    source_id: input.sourceId,
    entity_type: "experience",
    entity_key: `resume-${contentHash(line).slice(0, 20)}`,
    claim_type: "resume_source",
    value: line,
    display_text: line,
    source_excerpt: line,
    status: selfReportedSupplement ? "unverified" : "confirmed",
    // Bulk inserts must provide the same columns on every row; omitted fields
    // become NULL rather than their DB defaults when another row supplies them.
    source_kind: selfReportedSupplement ? "user_statement" : "user_upload",
    verification_level: "self_reported",
    visibility: "recruiter_safe",
    confirmed_at: selfReportedSupplement ? null : new Date().toISOString(),
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
  const sourceKind = (row.source_kind ? String(row.source_kind) : "migrated_legacy") as SourceKind;
  const verificationLevel = (row.verification_level ? String(row.verification_level) : "self_reported") as VerificationLevel;
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
    sourceKind,
    verificationLevel,
    migratedFrom: row.migrated_from ? String(row.migrated_from) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

const CLAIM_COLUMNS = "id, source_id, opportunity_id, entity_type, entity_key, claim_type, value, display_text, source_excerpt, status, visibility, source_kind, verification_level, migrated_from, updated_at";

/**
 * 作用域优先：先在数据库里按「用户 + 岗位作用域」筛掉无关行，再排序。
 * 旧实现先取最近 500 条 claims / 50 条 artifacts 再在内存里过滤，
 * 结果旧岗位的相关证据可能在查询阶段就被新数据挤掉了。
 */
function scopeToUserAndOpportunity<T>(
  query: T,
  opportunityId: string | null | undefined,
  apply: (q: T, expression: string) => T,
  applyIsNull: (q: T) => T,
): T {
  return opportunityId
    ? apply(query, `opportunity_id.is.null,opportunity_id.eq.${assertUuid(opportunityId, "opportunityId")}`)
    : applyIsNull(query);
}

export async function getContextBundleForUser(input: {
  userId: string;
  task: CoachActionType;
  opportunityId?: string | null;
  intent?: string | null;
  planVersion?: number | null;
  selectedOpportunityIds?: string[];
  deadline?: string | null;
  userOverride?: boolean;
  currentInput?: string | null;
  retrievalQuery?: string | null;
  retrievalTask?: AgentKnowledgeTask;
  questionSource?: { id: string; text: string; version?: string | null } | null;
  historySummary?: { id: string; text: string } | null;
  attachments?: ContextAttachment[];
  routeClass?: RouteClass;
  budget?: Partial<ContextBudget>;
  knowledgeLimit?: number;
  claimSelection?: "all_required" | "relevant";
}): Promise<ContextBundle> {
  const db = requireDb(await getDbClient());
  let opportunity: OpportunityContext | null = null;
  let resumeAttachment: ContextAttachment | null = null;

  if (input.opportunityId) {
    const { data, error } = await db.from("coach_opportunities")
      .select("id, company, role, stage, jd_text, jd_version, scheduled_interview_at, metadata")
      .eq("id", input.opportunityId).eq("user_id", input.userId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("岗位不存在");
    opportunity = {
      id: String(data.id), company: String(data.company), role: String(data.role), stage: String(data.stage),
      jdText: data.jd_text ? String(data.jd_text) : null, jdVersion: Number(data.jd_version),
      scheduledInterviewAt: data.scheduled_interview_at ? String(data.scheduled_interview_at) : null,
    };
    // 岗位档案里已上传的简历原文必须直达导师：以前导师只能看到 claims 摘要，
    // 简历刚上传、逐条事实还没沉淀时就会说出「你没上传实习经历」这种反问。
    const meta = (data.metadata ?? {}) as { resumeText?: unknown };
    if (input.task !== "resume_workshop" && typeof meta.resumeText === "string" && meta.resumeText.trim()) {
      resumeAttachment = { id: "resume-text", label: "用户已上传的简历原文（其中已有的信息不得反问）", text: meta.resumeText.trim(), required: input.claimSelection === "all_required" };
    }
  }

  const routeClass: RouteClass = input.routeClass || "bounded_orchestration";

  let claimQuery = db.from("coach_claims").select(CLAIM_COLUMNS).eq("user_id", input.userId);
  claimQuery = scopeToUserAndOpportunity(
    claimQuery, opportunity?.id ?? null,
    (q, expression) => q.or(expression),
    (q) => q.is("opportunity_id", null),
  );

  let artifactQuery = db.from("coach_artifacts")
    .select("id, opportunity_id, artifact_type, version, title, status, content, created_by, created_at")
    .eq("user_id", input.userId);
  artifactQuery = scopeToUserAndOpportunity(
    artifactQuery, opportunity?.id ?? null,
    (q, expression) => q.or(expression),
    (q) => q.is("opportunity_id", null),
  );
  const [{data:claimRows,error:claimError},{data:artifactRows,error:artifactError}]=await Promise.all([
    claimQuery.order("updated_at", { ascending: false }).limit(300),
    artifactQuery.order("created_at", { ascending: false }).limit(100),
  ]);
  if (claimError) throw claimError;
  if (artifactError) throw artifactError;
  const relevantArtifacts = (artifactRows || []) as DbRow[];

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
    status: String(row.status), content: row.content, claimIds: claimLinks[String(row.id)] || [],
    createdAt: String(row.created_at),
    createdBy: (["user", "hosted_ai", "personal_agent", "system"].includes(String(row.created_by))
      ? String(row.created_by)
      : "hosted_ai") as NonNullable<ArtifactReference["createdBy"]>,
  }));

  // PRD §5.6：知识片段默认 0 条，需要时才取最相关的少量完整片段。
  // 直接执行不检索；单次推理最多 1–2 个完整片段；有界编排才放宽到 6。
  const knowledgeLimit = input.knowledgeLimit
    ?? (routeClass === "direct" ? 0 : routeClass === "single_inference" ? 2 : 6);
  const knowledge = knowledgeLimit > 0
    ? await buildAgentKnowledgeContext({
        task: input.retrievalTask || knowledgeTask(input.task),
        company: opportunity?.company,
        role: opportunity?.role,
        query: [input.retrievalQuery || input.currentInput, opportunity?.company, opportunity?.role, opportunity?.jdText?.slice(0, 180), input.task].filter(Boolean).join(" "),
        limit: knowledgeLimit,
      })
    : { items: [], contextText: "" };

  return compileContextBundle({
    task: input.task,
    userId: input.userId,
    opportunity,
    claims: ((claimRows || []) as DbRow[]).map(mapClaim),
    claimSelection: input.claimSelection,
    artifacts,
    knowledge: knowledge.items.map((item) => ({
      id: item.id,
      title: item.title,
      content: `${item.content.slice(0,2600)}\n使用边界：${item.doNotUseWhen.join("；")}\n来源：${item.evidence.slice(0,2).map(s=>s.url).join("\n")}`,
      description: item.description,
      goal: item.goal,
      scope: item.scope,
      confidence: item.confidence,
      evidenceUrls: item.evidence.map((source) => source.url),
    })),
    knowledgeContext: knowledge.contextText,
    currentInput: input.currentInput,
    questionSource: input.questionSource,
    attachments: resumeAttachment ? [resumeAttachment, ...(input.attachments || [])] : input.attachments,
    historySummary: input.historySummary,
    intent: input.intent,
    planVersion: input.planVersion,
    selectedOpportunityIds: input.selectedOpportunityIds,
    deadline: input.deadline,
    userOverride: input.userOverride,
    routeClass,
    budget: input.budget,
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
  sourceKind?: SourceKind; verificationLevel?: VerificationLevel;
}) {
  const db = requireDb(await getDbClient());
  const status = input.status || "unverified";
  // 只有用户确认路径能把 verification_level 提到 user_confirmed；
  // 建 claim 时即使传 confirmed，也只能算自述，不能冒充逐条确认。
  const verificationLevel: VerificationLevel =
    input.verificationLevel || (status === "confirmed" ? "user_confirmed" : "self_reported");
  const { data, error } = await db.from("coach_claims").insert({
    user_id: input.userId, opportunity_id: input.opportunityId || null, source_id: input.sourceId || null,
    entity_type: input.entityType, entity_key: input.entityKey, claim_type: input.claimType,
    value: input.value, display_text: input.displayText, source_excerpt: input.sourceExcerpt || null,
    status, visibility: input.visibility || "private",
    source_kind: input.sourceKind || "user_statement",
    verification_level: verificationLevel,
    confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
  }).select("*").single();
  if (error) throw error;
  return mapClaim(data);
}

/**
 * PRD §5.2：模型只提出候选，只有用户确认才能改变确认状态。
 * 迁移继承的确认不算本次确认，因此 migrated_from 保留原值。
 */
export async function confirmClaim(userId: string, claimId: string) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_claims").update({
    status: "confirmed",
    verification_level: "user_confirmed",
    confirmed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", assertUuid(claimId, "claimId")).eq("user_id", userId).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("事实不存在");
  return mapClaim(data);
}

export async function withdrawClaim(userId: string, claimId: string, reason?: string) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_claims").update({
    status: "withdrawn",
    migrated_from: reason ? `withdrawn:${reason}` : "withdrawn",
    updated_at: new Date().toISOString(),
  }).eq("id", assertUuid(claimId, "claimId")).eq("user_id", userId).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("事实不存在");
  return mapClaim(data);
}

/** 事实冲突时保留两条，标记冲突，不静默选一条当成真的。 */
export async function markClaimConflicted(userId: string, claimIds: string[]) {
  const db = requireDb(await getDbClient());
  const ids = claimIds.map((id) => assertUuid(id, "claimId"));
  const { data, error } = await db.from("coach_claims").update({
    status: "conflicted", updated_at: new Date().toISOString(),
  }).in("id", ids).eq("user_id", userId).select("*");
  if (error) throw error;
  return (data || []).map(mapClaim);
}

/**
 * 目标公司档位偏好（FR-9 剔除分支的开关）的唯一存储位置。
 * 面板点选与别处抽到的意向都写这张表，读取只看这一处——避免「对话里说过的」
 * 和「面板选的」变成两套口径。生效值与待确认意向的读法在 `lib/jobs/tier-intent.ts`。
 */
export async function listTierPreferenceClaims(userId: string): Promise<CareerClaim[]> {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_claims").select(CLAIM_COLUMNS)
    .eq("user_id", userId).eq("entity_type", "preference").eq("entity_key", TIER_PREFERENCE_KEY)
    .neq("status", "withdrawn").order("updated_at", { ascending: false }).limit(20);
  if (error) throw error;
  return (data || []).map(mapClaim);
}

export async function readUserTierPreference(userId: string): Promise<TierPreferenceState> {
  return readTierPreference(await listTierPreferenceClaims(userId));
}

/**
 * 用户自己的点选 = 已确认偏好：写一条 confirmed，并把同键的旧意向撤回。
 * 撤回不删行（历史留着），但旧意向不再参与判定，也不会再被提示一遍。
 */
export async function saveTierPreference(userId: string, tiers: CompanyTier[], sourceExcerpt: string | null) {
  const db = requireDb(await getDbClient());
  const { error: supersedeError } = await db.from("coach_claims").update({
    status: "withdrawn", migrated_from: "withdrawn:superseded", updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("entity_type", "preference").eq("entity_key", TIER_PREFERENCE_KEY).neq("status", "withdrawn");
  if (supersedeError) throw supersedeError;
  return createClaim({
    userId, entityType: "preference", entityKey: TIER_PREFERENCE_KEY, claimType: TIER_PREFERENCE_CLAIM_TYPE,
    value: { tiers }, displayText: `目标公司档位：${tierLabels(tiers)}`,
    sourceExcerpt, status: "confirmed", sourceKind: "user_statement",
  });
}

/**
 * 接住别处说过的档位意向（对话消息、求职方向这类**用户自己写的短句**）。
 * 抽不出立场就返回 null，什么都不写；抽到了也只落成待确认——确认前不拿它剔岗位。
 */
export async function recordTierIntentFromText(input: {
  userId: string; text: string; opportunityId?: string | null; sourceId?: string | null;
}): Promise<CareerClaim | null> {
  const intent = parseTierIntent(input.text);
  if (!intent) return null;
  const current = readTierPreference(await listTierPreferenceClaims(input.userId));
  // 同一个意向不重复记第二行：已生效的、或已经在待核对里的，都不再写
  if (current.origin === "explicit" && sameTierSet(current.effectiveTiers, intent.tiers)) return null;
  if (current.pending && sameTierSet(current.pending.tiers, intent.tiers)) return null;
  return createClaim({
    userId: input.userId, opportunityId: input.opportunityId ?? null, sourceId: input.sourceId ?? null,
    entityType: "preference", entityKey: TIER_PREFERENCE_KEY, claimType: TIER_PREFERENCE_CLAIM_TYPE,
    value: { tiers: intent.tiers }, displayText: `目标公司档位：${tierLabels(intent.tiers)}（原话：${intent.excerpt}）`,
    sourceExcerpt: intent.excerpt, status: "unverified", sourceKind: "user_statement",
  });
}

/* ------------------------- 岗位决定（A4） ------------------------- */

/**
 * 用户对自己推荐的岗位表过的态。与档位偏好同一张表、同一 `entity_type=preference`，
 * 靠 `entity_key` 前缀分开（口径见 `lib/jobs/job-decision.ts`）——不加新表也不改生产库结构。
 * 同一条岗只回最新那条：改过的主意留着历史行，但界面不该再显示旧决定。
 */
export async function listJobDecisions(userId: string): Promise<JobDecision[]> {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_claims").select(CLAIM_COLUMNS)
    .eq("user_id", userId).eq("entity_type", "preference").eq("claim_type", JOB_DECISION_CLAIM_TYPE)
    .neq("status", "withdrawn").order("updated_at", { ascending: false }).limit(200);
  if (error) throw error;
  const seen = new Set<string>();
  const decisions: JobDecision[] = [];
  for (const row of (data || []) as DbRow[]) {
    const decision = decisionFromValue(row.value, String(row.id), row.updated_at ? String(row.updated_at) : null);
    // 读不出的行直接跳过：半截决定会在界面上显示成一个没做过的表态，比不显示更糟
    if (!decision) continue;
    const key = decisionEntityKey(decision.url, decision.batchRunId);
    if (seen.has(key)) continue;
    seen.add(key);
    decisions.push(decision);
  }
  return decisions;
}

/**
 * 保存 = 撤回同一条岗的旧决定 + 写一条 confirmed，两步都成才算保存成功。
 * 返回值里的 `claimId` 来自服务端真实插入结果；拿不到就抛错，界面不许说「已保存」。
 */
export async function saveJobDecision(
  userId: string,
  input: Omit<JobDecision, "claimId" | "savedAt">,
  concurrency: {requestId: string; expectedClaimId: string | null},
): Promise<JobDecision> {
  const db = requireDb(await getDbClient());
  const row = decisionClaimRow(input);
  const {data, error} = await db.rpc("save_coach_job_decision", {
    p_user_id:userId, p_entity_key:row.entityKey, p_value:row.value,
    p_display_text:row.displayText, p_request_id:concurrency.requestId,
    p_expected_claim_id:concurrency.expectedClaimId,
  });
  if(error) throw error;
  const decision = data && decisionFromValue(data.value, String(data.id), data.updated_at);
  if(!decision) throw new Error("决定保存结果不完整");
  return decision;
}

/** PRD §5.8：把 Context 的取舍落库，回答「我上传过怎么没看到」。 */
export async function persistContextSelections(input: {
  runId: string; userId: string; context: ContextBundle;
}) {
  const db = requireDb(await getDbClient());
  const rows = [
    ...input.context.selection.included.map((entry) => ({
      run_id: input.runId, user_id: input.userId, context_version: input.context.version,
      decision: "included", kind: entry.kind, ref_id: entry.refId, ref_version: entry.refVersion || null,
      trust_type: entry.trustType, reason: entry.reason, estimated_tokens: entry.estimatedTokens,
      rule: entry.rule, required: entry.required, cost: entry.estimatedTokens,
    })),
    ...input.context.selection.excluded.map((entry) => ({
      run_id: input.runId, user_id: input.userId, context_version: input.context.version,
      decision: "excluded", kind: entry.kind, ref_id: entry.refId, ref_version: null,
      trust_type: null, reason: entry.reason, detail: entry.detail, estimated_tokens: 0,
      rule: entry.rule, required: entry.required ?? false, cost: entry.cost ?? 0,
    })),
  ];
  if (!rows.length) return;
  const { error } = await db.from("coach_run_context_selections").insert(rows);
  if (error) throw error;
}

export async function createCoachRun(input: {
  userId: string; opportunityId?: string | null; task: CoachActionType; executor: CoachExecutor;
  goal: string; payload?: Record<string, unknown>; context: ContextBundle; requiresConfirmation?: boolean;
  promptVersion?: string | null;
  idempotencyKey?: string | null;
}) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_runs").insert({
    user_id: input.userId, opportunity_id: input.opportunityId || null, action_type: input.task,
    executor: input.executor, goal: input.goal, input: input.payload || {}, context_snapshot: input.context,
    requires_confirmation: Boolean(input.requiresConfirmation),
    idempotency_key: input.idempotencyKey ?? null,
    // PRD §5.3 / §5.8：每次运行记录 Context、Prompt 版本、意图、计划和预算。
    context_version: input.context.version,
    prompt_version: input.promptVersion || null,
    intent: input.context.intent,
    plan_version: input.context.planVersion,
    selected_opportunity_ids: input.context.selectedOpportunityIds,
    deadlines: input.context.deadline ? { primary: input.context.deadline } : {},
    budget: input.context.budget,
    status: "reading",
  }).select("*").single();
  if (error) throw error;
  await db.from("coach_run_events").insert({
    user_id: input.userId, run_id: data.id, event_type: "created",
    payload: { fingerprint: input.context.fingerprint, budget: input.context.budget },
  });
  try {
    await persistContextSelections({ runId: String(data.id), userId: input.userId, context: input.context });
    await db.from("coach_run_events").insert({
      user_id: input.userId, run_id: data.id, event_type: "context_compiled",
      payload: {
        included: input.context.selection.included.length,
        excluded: input.context.selection.excluded.length,
        usedTokens: input.context.usage.usedTokens,
        truncated: input.context.usage.truncated,
      },
    });
  } catch (selectionError) {
    // A multi-step run without its audit cannot claim a completed reconstruction.
    await db.from("coach_runs").update({ status: "failed", stopped_reason: "error", updated_at: new Date().toISOString() })
      .eq("id", data.id).eq("user_id", input.userId).eq("status", "reading");
    throw selectionError;
  }
  return data;
}

/**
 * 状态迁移走统一入口：非法迁移直接拒绝，终态必须带明确的停止原因。
 * PRD §4.2 / §5.6：生成完但未持久化不算完成，超时、费用上限、权限不足、
 * 用户取消、无法举证都有明确停止状态。
 */
export async function updateRunStatus(input: {
  userId: string; runId: string; to: CoachRunStatus;
  stoppedReason?: CoachStopReason | null; payload?: Record<string, unknown>;
  modelCallCount?: number; toolCallCount?: number;
}) {
  const db = requireDb(await getDbClient());
  const { data: current, error: currentError } = await db.from("coach_runs")
    .select("id, status").eq("id", assertUuid(input.runId, "runId")).eq("user_id", input.userId).maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error("运行不存在");
  const from = normalizeRunStatus(String(current.status));
  assertRunTransition(from, input.to);

  const stoppedReason = input.stoppedReason ?? null;
  if (isTerminalRunStatus(input.to) && !stoppedReason) {
    throw new Error(`运行进入终态 ${input.to} 必须给出停止原因`);
  }
  if (stoppedReason && !isValidStopReason(input.to, stoppedReason)) {
    throw new Error(`停止原因 ${stoppedReason} 与状态 ${input.to} 不匹配`);
  }

  const { data, error } = await db.from("coach_runs").update({
    status: input.to,
    stopped_reason: stoppedReason,
    model_call_count: input.modelCallCount ?? undefined,
    tool_call_count: input.toolCallCount ?? undefined,
    completed_at: isTerminalRunStatus(input.to) ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", input.runId).eq("user_id", input.userId).eq("status", current.status).select("*").single();
  if (error) throw error;
  if (!data) throw new Error("运行状态已变化，请重新读取任务");

  await db.from("coach_run_events").insert({
    user_id: input.userId, run_id: input.runId,
    event_type: isTerminalRunStatus(input.to) ? (input.to === "completed" ? "completed" : "stopped") : "planned",
    payload: { from, to: input.to, stoppedReason, ...(input.payload || {}) },
  });
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
    ? await db.from("coach_artifacts").select("id, opportunity_id, version, content").in("opportunity_id", ids).eq("artifact_type", "target_resume").order("version", { ascending: false })
    : { data: [], error: null };
  if (artifactError) throw artifactError;
  const latestArtifacts = new Map<string, DbRow>();
  for (const artifact of (artifactRows || []) as DbRow[]) if (!latestArtifacts.has(String(artifact.opportunity_id))) latestArtifacts.set(String(artifact.opportunity_id), artifact);
  const artifactIds = [...latestArtifacts.values()].map((artifact) => String(artifact.id));
  const { data: reviewRows, error: reviewError } = artifactIds.length
    ? await db.from("coach_artifact_reviews").select("artifact_id, reviewer_type, status, summary, findings").in("artifact_id", artifactIds)
    : { data: [], error: null };
  if (reviewError) throw reviewError;
  return rows.map((row) => {
    const metadata = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Partial<Opportunity>;
    const opportunityId = String(row.id);
    const artifact = latestArtifacts.get(opportunityId);
    const reviews = ((reviewRows || []) as DbRow[]).filter((review) => String(review.artifact_id) === String(artifact?.id));
    const retainedOriginal = Boolean(artifact?.content && typeof artifact.content === "object" && (artifact.content as { retainedOriginal?: boolean }).retainedOriginal === true);
    return {
      ...metadata,
      id: String(row.id),
      company: String(row.company),
      role: String(row.role),
      stage: String(row.stage) as Opportunity["stage"],
      jdText: row.jd_text ? String(row.jd_text) : undefined,
      location: metadata.location || "地点待确认",
      stageLabel: STAGE_STATUS_WORDS[String(row.stage)] || metadata.stageLabel || "评估中",
      priority: metadata.priority || "medium",
      sourceLabel: metadata.sourceLabel || "网页端",
      capturedAtLabel: metadata.capturedAtLabel || "已同步",
      nextEventLabel: metadata.nextEventLabel || null,
      scheduledInterviewAt: row.scheduled_interview_at ? String(row.scheduled_interview_at) : metadata.scheduledInterviewAt || null,
      recommendation: metadata.recommendation || "prepare_then_apply",
      recommendationLabel: metadata.recommendationLabel || "等待完成分析",
      recommendationReason: metadata.recommendationReason || "岗位已收录。当前未形成可靠结论，请继续补充真实经历。",
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
        artifactId: String(artifact.id), version: Number(artifact.version), status: resumeQualityStatus(retainedOriginal, reviews.map(review => ({ reviewer_type: review.reviewer_type, status: review.status }))),
        reviews: reviews.map((review) => ({ reviewerType: review.reviewer_type as NonNullable<Opportunity["applicationQuality"]>["reviews"][number]["reviewerType"], status: review.status as NonNullable<Opportunity["applicationQuality"]>["reviews"][number]["status"], summary: String(review.summary), findings: readReviewFindings(review.findings) })),
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
    metadata: { ...metadata, stageEnteredAt: new Date().toISOString() },
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
    if (source.type === "resume") await import("./run-ledger/events").then(({ intakeEvent }) => intakeEvent({ userId, opportunityId, clientEventId: `resume_${sourceRow.id}`, kind: "resume_saved", properties: { source_id: sourceRow.id } })).catch(() => console.error("Resume saved but intake unavailable"));
  }

  return { ...opportunity, id: opportunityId } satisfies Opportunity;
}

export async function updateCockpitOpportunityStage(userId: string, id: string, stage: Opportunity["stage"]) {
  const db = requireDb(await getDbClient());
  const { data: current, error: readError } = await db.from("coach_opportunities").select("stage,metadata,updated_at")
    .eq("id", id).eq("user_id", userId).maybeSingle();
  if (readError) throw readError;
  if (!current) throw new Error("岗位不存在或已删除");
  if (current.stage === stage) return;
  const now = new Date().toISOString();
  let write = db.from("coach_opportunities").update({ stage, metadata: { ...current.metadata, stageEnteredAt: now }, updated_at: now })
    .eq("id", id).eq("user_id", userId).eq("stage", current.stage);
  if (current.updated_at) write = write.eq("updated_at", current.updated_at);
  const { data, error } = await write.select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("岗位已变化或已删除，请刷新后重试");
  await import("./run-ledger/events").then(({ intakeEvent }) => intakeEvent({ userId, opportunityId: id, clientEventId: `stage_${id}_${Date.now()}`, kind: "stage_changed", properties: { stage }, occurredAt: now })).catch(() => console.error("Stage saved but intake unavailable"));
}

export async function updateCockpitOpportunity(userId: string, opportunity: Opportunity, preserveStage = false) {
  const db = requireDb(await getDbClient());
  const { id, jdText, company, role, stage, scheduledInterviewAt, ...metadata } = opportunity;
  const { data: current, error: currentError } = await db.from("coach_opportunities").select("stage, jd_text, jd_version, metadata")
    .eq("id", id).eq("user_id", userId).maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error("岗位不存在");

  // 客户端有 900ms 防抖的自动同步 PATCH，可能带着尚未填充 JD/简历的岗位状态。
  // 空值不能抹掉服务器上已有的材料，否则会出现「界面展示 JD/简历快照、
  // 接口却报缺 JD 缺简历」的预览矛盾（PRD §可解释：展示与判定必须同源）。
  const incomingJd = typeof jdText === "string" ? jdText.trim() : "";
  const currentJd = current.jd_text ? String(current.jd_text) : "";
  const nextJd = incomingJd || currentJd;

  const currentMetadata = current.metadata && typeof current.metadata === "object" ? current.metadata as Record<string, unknown> : {};
  const prevResume = typeof currentMetadata.resumeText === "string" ? currentMetadata.resumeText : "";
  const incomingResume = typeof opportunity.resumeText === "string" ? opportunity.resumeText.trim() : "";
  const nextResume = incomingResume || prevResume;
  const mergedMetadata: Record<string, unknown> = { ...metadata };
  // Client auto-save cannot erase or forge the server-owned stage clock.
  mergedMetadata.stageEnteredAt = !preserveStage && current.stage !== stage
    ? new Date().toISOString() : currentMetadata.stageEnteredAt || null;
  if (nextResume) mergedMetadata.resumeText = nextResume;

  const jdChanged = Boolean(nextJd && nextJd !== current.jd_text);
  const resumeChanged = Boolean(nextResume && nextResume !== prevResume);
  const { error } = await db.from("coach_opportunities").update({
    company, role, ...(preserveStage ? {} : { stage }), jd_text: nextJd || null, scheduled_interview_at: scheduledInterviewAt || null,
    jd_version: jdChanged ? Number(current.jd_version) + 1 : Number(current.jd_version), metadata: mergedMetadata, updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
  if (jdChanged && nextJd) {
    const source = await recordSource({ userId, opportunityId: id, sourceType: "jd", title: `${company} · ${role} JD`, content: nextJd });
    await createOpportunitySnapshot({ userId, opportunityId: id, snapshotType: "jd", title: `${company} · ${role} JD`, content: { text: nextJd }, sourceId: source.id, createdBy: "user" });
  }
  if (resumeChanged && nextResume) {
    const source = await recordSource({ userId, opportunityId: id, sourceType: "resume", title: `${role} 使用的简历`, content: nextResume });
    await createOpportunitySnapshot({ userId, opportunityId: id, snapshotType: "base_resume", title: `${role} 使用的简历`, content: { text: nextResume }, sourceId: source.id, createdBy: "user" });
    await recordResumeClaims({ userId, opportunityId: id, sourceId: source.id, content: nextResume, global: opportunity.workspaceType === "preparation" });
    await import("./run-ledger/events").then(({ intakeEvent }) => intakeEvent({ userId, opportunityId: id, clientEventId: `resume_${source.id}`, kind: "resume_saved", properties: { source_id: source.id } })).catch(() => console.error("Resume saved but intake unavailable"));
  }
  if (!preserveStage && current.stage !== stage) await import("./run-ledger/events").then(({ intakeEvent }) => intakeEvent({ userId, opportunityId: id, clientEventId: `stage_${id}_${Date.now()}`, kind: "stage_changed", properties: { stage } })).catch(() => console.error("Stage saved but intake unavailable"));
}

/** 删除岗位机会。仅按 id + user_id 定位，RLS 兜底跨用户；关联快照/证据由级联清理。 */
export async function deleteCockpitOpportunity(userId: string, id: string): Promise<void> {
  const db = requireDb(await getDbClient());
  const { error } = await db.from("coach_opportunities").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}
