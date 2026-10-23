/** Shared delivery contract for one resume generation. Historical rows without
 * these fields stay unknown. This module does not read a database or a model. */

export const RESUME_DELIVERY_SCHEMA_VERSION = 2 as const;

export const RESUME_DELIVERY_OUTCOMES = [
  "running",
  "delivered",
  "partial_delivered",
  "unchanged",
  "needs_detail",
  "blocked",
  "failed",
  "quota_denied",
  "unconfirmed",
  "unknown",
] as const;
export type ResumeDeliveryOutcome = (typeof RESUME_DELIVERY_OUTCOMES)[number];

export const RESUME_PERSISTENCE = ["confirmed", "not_persisted", "returned_only", "unknown"] as const;
export type ResumePersistence = (typeof RESUME_PERSISTENCE)[number];

/** Written only by the server that holds the owner and the lease. */
export const SERVER_RESUME_EVENTS = [
  "resume_task_started",
  "resume_task_outcome",
  "resume_document_persisted",
] as const;

/** The browser may report that it rendered or that the user chose, never that
 * the server saved a document or finished a generation. */
export const CLIENT_RESUME_EVENTS = ["resume_result_presented", "resume_change_decided"] as const;

export const ENTRY_EVENTS = ["entry_selected", "entry_submitted", "entry_result_presented", "entry_failed"] as const;

export const RESUME_REASON_CODES = [
  "model_response_incomplete",
  "resume_empty_response",
  "resume_model_timeout",
  "resume_repair_timeout",
  "resume_repair_incomplete",
  "resume_detail_needed",
  "resume_document_review_failed",
  "resume_draft_unverified",
  "resume_review_failed",
  "resume_no_deliverable_change",
  "resume_mapping_conflict",
  "resume_review_unavailable",
  "context_budget_exceeded",
  "quota_denied",
  "cas_conflict",
  "trace_unconfirmed",
  "draft_returned_without_opportunity",
  "request_failed",
  "unlisted",
] as const;
export type ResumeReasonCode = (typeof RESUME_REASON_CODES)[number];

export interface ResumeDeliveryReceipt {
  schemaVersion: typeof RESUME_DELIVERY_SCHEMA_VERSION;
  generationId: string | null;
  traceId: string | null;
  evalRunId: string | null;
  outcome: ResumeDeliveryOutcome;
  deliveredCount: number | null;
  persistence: ResumePersistence;
  stage: string | null;
  reasonCode: ResumeReasonCode | null;
  retryable: boolean | null;
  observation?: "confirmed" | "unconfirmed";
}

export interface ResumeDeliveryFacts {
  taskState?: "idle" | "running" | "needs_detail" | "ready" | "failed" | "stale" | null;
  unchanged?: boolean | null;
  /** Newly retained changes for this generation. Null when the previous set is unknown. */
  newChangeCount?: number | null;
  hasFollowUp?: boolean | null;
  hasUnresolved?: boolean | null;
  quotaDenied?: boolean | null;
  blocked?: boolean | null;
  /** This generation was read back for the owner after commit. */
  persisted?: boolean | null;
  returnedWithoutOpportunity?: boolean | null;
  /** Final trace row was not written. Do not invent failed or delivered from that gap. */
  traceFinishMissing?: boolean | null;
  reasonCode?: string | null;
  stage?: string | null;
  generationId?: string | null;
  traceId?: string | null;
  evalRunId?: string | null;
  retryable?: boolean | null;
}

export function countNewResumeChanges(
  previous: { id?: string }[] | null | undefined,
  current: { id?: string }[] | null | undefined,
): number | null {
  if (!Array.isArray(current) || !Array.isArray(previous)) return null;
  const old = new Set(previous.map((change) => change.id).filter(Boolean));
  return new Set(current.map(change => change.id).filter(id => id && !old.has(id))).size;
}

export function normalizeResumeReason(value: unknown): ResumeReasonCode | null {
  if (typeof value !== "string" || !value) return null;
  return (RESUME_REASON_CODES as readonly string[]).includes(value) ? (value as ResumeReasonCode) : "unlisted";
}

export function classifyResumeDelivery(facts: ResumeDeliveryFacts = {}): ResumeDeliveryReceipt {
  const reasonCode = facts.quotaDenied ? "quota_denied" : normalizeResumeReason(facts.reasonCode);
  const returnedOnly = facts.returnedWithoutOpportunity === true;
  let persistence: ResumePersistence = facts.persisted ? "confirmed" : facts.persisted === false || returnedOnly ? (returnedOnly ? "returned_only" : "not_persisted") : "unknown";
  if (returnedOnly) persistence = "returned_only";
  let outcome: ResumeDeliveryOutcome = "unknown";
  if (facts.quotaDenied) outcome = "quota_denied";
  else if (facts.blocked || reasonCode === "context_budget_exceeded" || reasonCode === "cas_conflict") outcome = "blocked";
  else if (facts.traceFinishMissing && !facts.persisted && facts.taskState !== "ready" && facts.taskState !== "needs_detail" && facts.taskState !== "failed") outcome = "unconfirmed";
  else if (facts.taskState === "running" && !facts.persisted) outcome = "running";
  else if (facts.taskState === "needs_detail" && !(facts.persisted && (facts.newChangeCount || 0) > 0)) outcome = "needs_detail";
  else if (facts.unchanged || (facts.persisted && facts.newChangeCount === 0 && !facts.hasFollowUp && !facts.hasUnresolved)) outcome = "unchanged";
  else if (facts.persisted && (facts.newChangeCount || 0) > 0 && (facts.hasFollowUp || facts.hasUnresolved)) outcome = "partial_delivered";
  else if (facts.persisted && (facts.newChangeCount || 0) > 0) outcome = "delivered";
  else if (facts.hasFollowUp && facts.newChangeCount === 0) outcome = "needs_detail";
  else if (!facts.persisted && (facts.taskState === "failed" || reasonCode === "model_response_incomplete" || reasonCode === "resume_review_unavailable" || reasonCode === "resume_document_review_failed" || reasonCode === "request_failed")) outcome = "failed";
  else if (facts.persisted && facts.newChangeCount === null) outcome = "unknown";
  if (returnedOnly && (outcome === "delivered" || outcome === "partial_delivered")) persistence = "returned_only";
  return {
    schemaVersion: RESUME_DELIVERY_SCHEMA_VERSION,
    generationId: facts.generationId || null,
    traceId: facts.traceId || null,
    evalRunId: facts.evalRunId || null,
    outcome,
    deliveredCount: facts.newChangeCount ?? null,
    persistence,
    stage: facts.stage || null,
    reasonCode,
    retryable: facts.retryable ?? null,
  };
}

const generationPattern = /^[A-Za-z0-9:_-]{8,80}$/;
const tokenPattern = /^[a-z0-9_]{1,48}$/;
export function isServerResumeEvent(name: string) {
  return (SERVER_RESUME_EVENTS as readonly string[]).includes(name);
}

function token(value: unknown, pattern: RegExp) {
  return typeof value === "string" && pattern.test(value) ? value : null;
}

/** Drop material text. Missing required fields reject the event instead of counting it. */
export function prepareClientDeliveryEvent(
  name: string,
  clientEventId: string,
  properties: Record<string, unknown>,
): { clientEventId: string; properties: Record<string, string | number | boolean | null> } | { error: string } {
  if ((ENTRY_EVENTS as readonly string[]).includes(name)) {
    const kind = token(properties.entry_kind, /^(resume|jd|find_jobs|one_sentence)$/);
    if (!kind) return { error: "入口类型无效" };
    const requestId = token(properties.request_id, /^[A-Za-z0-9_-]{8,80}$/);
    const submissionId = token(properties.submission_id, /^[A-Za-z0-9_-]{8,80}$/);
    if (name !== "entry_selected" && !requestId && !submissionId) return { error: "缺少本次提交编号" };
    const stage = properties.stage == null ? null : token(properties.stage, /^(intake|analysis|save|conversation|restore)$/);
    if (properties.stage != null && !stage) return { error: "入口阶段无效" };
    const reason = properties.reason_code == null ? null : token(properties.reason_code, tokenPattern);
    if (properties.reason_code != null && !reason) return { error: "入口错误码无效" };
    const source = properties.entry_source == null ? null : token(properties.entry_source, /^(url|click)$/);
    const page = token(properties.page_category, /^\/[a-z0-9/_-]{0,40}$/) || "/other";
    const safe: Record<string, string | number | boolean | null> = { schema_version: RESUME_DELIVERY_SCHEMA_VERSION, entry_kind: kind, page_category: page };
    if (source) safe.entry_source = source;
    if (requestId) safe.request_id = requestId;
    if (submissionId) safe.submission_id = submissionId;
    if (stage) safe.stage = stage;
    if (reason) safe.reason_code = reason;
    if (typeof properties.reused_material === "boolean") safe.reused_material = properties.reused_material;
    let id = clientEventId;
    if (name !== "entry_selected") id = resumeDeliveryEventId(`${name}-${kind}-${stage || "none"}`, requestId || submissionId!);
    return { clientEventId: id, properties: safe };
  }
  if (name === "resume_result_presented" || name === "resume_change_decided") {
    const generationId = token(properties.generation_id, generationPattern);
    if (!generationId) return { error: "缺少这一代修改编号" };
    const safe: Record<string, string | number | boolean | null> = { schema_version: RESUME_DELIVERY_SCHEMA_VERSION, generation_id: generationId };
    if (name === "resume_change_decided") {
      const changeId = token(properties.change_id, /^[A-Za-z0-9_-]{4,80}$/);
      const decision = token(properties.decision, /^(accept|keep)$/);
      if (!changeId || !decision) return { error: "修改决定缺少编号" };
      safe.change_id = changeId;
      safe.decision = decision;
      return { clientEventId: resumeDeliveryEventId(`decision-${changeId}-${decision}`, generationId), properties: safe };
    }
    return { clientEventId: `resume-result-presented-${generationId}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96), properties: safe };
  }
  return { error: "事件不属于交付回执" };
}

export function resumeDeliveryEventId(event: string, generationId: string) {
  // Stable in both runtimes; retain the generation and hash the full identity,
  // so long change IDs cannot truncate away its revision or decision.
  const input = JSON.stringify([event, generationId]);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < input.length; i++) { a = Math.imul(a ^ input.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ input.charCodeAt(i); }
  return `${event.slice(0, 24)}-${generationId.slice(0, 45)}-${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function deliveryFromTask(
  task: { state?: ResumeDeliveryFacts["taskState"]; question?: unknown; result?: { changes?: { id?: string }[]; previousChanges?: { id?: string }[]; resumeGenerationId?: string; unchanged?: boolean } | null } | null,
  extra: ResumeDeliveryFacts = {},
): ResumeDeliveryReceipt {
  const generationId = extra.generationId || task?.result?.resumeGenerationId || null;
  const sameGeneration = !extra.generationId || task?.result?.resumeGenerationId === extra.generationId;
  const persisted = extra.persisted ?? (task?.state === "ready" && sameGeneration && Boolean(generationId));
  return classifyResumeDelivery({
    taskState: task?.state,
    unchanged: extra.unchanged ?? (sameGeneration ? task?.result?.unchanged : false),
    newChangeCount: extra.newChangeCount ?? (sameGeneration ? countNewResumeChanges(task?.result?.previousChanges, task?.result?.changes) : null),
    hasFollowUp: extra.hasFollowUp ?? (sameGeneration && Boolean(task?.question)),
    hasUnresolved: extra.hasUnresolved,
    persisted,
    generationId,
    quotaDenied: extra.quotaDenied,
    blocked: extra.blocked,
    returnedWithoutOpportunity: extra.returnedWithoutOpportunity,
    traceFinishMissing: extra.traceFinishMissing,
    reasonCode: extra.reasonCode,
    stage: extra.stage,
    traceId: extra.traceId,
    evalRunId: extra.evalRunId,
    retryable: extra.retryable,
  });
}
