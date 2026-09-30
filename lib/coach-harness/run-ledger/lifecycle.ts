/**
 * W5 / PRD FR-35：多步任务生命周期，架在 `coach_runs` + `coach_run_events` 上。
 *
 * 这一层存在的理由是设计文档点名的那条债：审计机制全都在，但没人调用——
 * `updateRunStatus` 全仓零调用、主链路只写 `coach_agent_turns`。
 * 所有状态迁移都从这里过，等于把 `createCoachRun` / `updateRunStatus` 重新接上电。
 *
 * 关页面语义：前端没有「我走了」的信令。所以跑中/保存中的行放着不动就是脏的，
 * 由 `reconcileStaleTasks` 在下次查询时按事件流水把它落成「部分完成」或「失败」，
 * 已完成的步骤结果留在 `coach_runs.output` 里可查——不静默丢弃。
 */

import { getDbClient } from "@/lib/db";
import { createCoachRun, requireDb, updateRunStatus } from "../repository";
import { normalizeRunStatus } from "../state-machine";
import type { CoachActionType, CoachRunStatus, CoachStopReason, ContextBundle } from "../types";
import type { TaskLedger, TaskOutcome, TaskStatus, TaskStepDefinition, TaskStepState } from "./types";

/** 非终态行放多久算「用户已经走了」。默认 15 分钟。 */
export const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;

type DbRow = Record<string, unknown>;

export interface RunEventInput {
  eventType: "planned" | "tool_started" | "tool_completed" | "validation" | "cancelled" | "artifact_saved";
  payload: Record<string, unknown>;
}

/** `coach_run_events.event_type` 的 CHECK 约束是封闭列表，这里只用允许值。 */
const EVENT_TYPE_ALLOWED: RunEventInput["eventType"][] = [
  "planned",
  "tool_started",
  "tool_completed",
  "validation",
  "cancelled",
  "artifact_saved",
];

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const time = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export async function appendRunEvent(input: {
  userId: string;
  runId: string;
  eventType: RunEventInput["eventType"];
  payload?: Record<string, unknown>;
}) {
  if (!EVENT_TYPE_ALLOWED.includes(input.eventType)) throw new Error(`不支持的运行事件类型：${input.eventType}`);
  const db = requireDb(await getDbClient());
  const { error } = await db.from("coach_run_events").insert({
    user_id: input.userId,
    run_id: input.runId,
    event_type: input.eventType,
    payload: input.payload || {},
  });
  if (error) throw error;
}

async function loadRun(userId: string, runId: string): Promise<DbRow> {
  const db = requireDb(await getDbClient());
  const { data, error } = await db
    .from("coach_runs")
    .select("*")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("任务不存在");
  return data as DbRow;
}

export async function loadRunEvents(userId: string, runId: string): Promise<DbRow[]> {
  const db = requireDb(await getDbClient());
  const { data, error } = await db
    .from("coach_run_events")
    .select("event_type, payload, created_at")
    .eq("run_id", runId)
    .eq("user_id", userId)
    .order("id", { ascending: true });
  if (error) throw error;
  return (data || []) as DbRow[];
}

async function persistRunOutput(userId: string, runId: string, output: unknown) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db
    .from("coach_runs")
    .update({ output, updated_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("user_id", userId)
    .in("status", ["reading", "ready", "running", "waiting_user", "saving"])
    .select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("任务已收尾，不能覆盖结果");
}

/** 失败详情进 `coach_runs.error`，output 保持空，避免「有产物却判失败」的矛盾读法。 */
async function persistRunError(userId: string, runId: string, errorDetail: Record<string, unknown>) {
  const db = requireDb(await getDbClient());
  const { error } = await db
    .from("coach_runs")
    .update({ error: errorDetail, updated_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("user_id", userId);
  if (error) throw error;
}

type LedgerEvent = { event_type?: unknown; payload?: unknown; created_at?: unknown };

function eventPayload(event: LedgerEvent): Record<string, unknown> {
  const payload = event.payload;
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}

/**
 * 从事件流水还原步骤状态。
 * 步骤不是库里的一列，是事件的投影——所以任何一步崩了都能从事件重放出来。
 */
export function deriveSteps(definitions: TaskStepDefinition[], events: LedgerEvent[]): TaskStepState[] {
  const states = new Map<string, TaskStepState>();
  for (const definition of definitions) states.set(definition.id, { ...definition, status: "pending" });

  for (const event of events) {
    const payload = eventPayload(event);
    if (event.event_type === "planned" && Array.isArray(payload.steps)) {
      for (const step of payload.steps as TaskStepDefinition[]) {
        if (!states.has(step.id)) states.set(step.id, { id: step.id, label: step.label ?? step.id, status: "pending" });
      }
    }
    if (event.event_type === "cancelled" && payload.skipNotices === true) {
      // 取消是任务级动作：没做完的步骤都不再转圈。
      for (const [id, state] of states) {
        if (state.status !== "done") states.set(id, { ...state, status: "skipped" });
      }
      continue;
    }
    const stepId = typeof payload.stepId === "string" ? payload.stepId : null;
    if (!stepId) continue;
    const current = states.get(stepId) || { id: stepId, label: stepId, status: "pending" as const };
    if (event.event_type === "tool_started") {
      states.set(stepId, { ...current, status: current.status === "done" ? current.status : "running" });
    }
    if (event.event_type === "tool_completed") {
      states.set(stepId, {
        ...current,
        status: "done",
        resultDigest: typeof payload.resultDigest === "string" ? payload.resultDigest : current.resultDigest,
        completedAt: typeof payload.at === "string" ? payload.at : current.completedAt,
      });
    }
  }
  return [...states.values()];
}

function latestOutcome(events: LedgerEvent[]): TaskOutcome | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const outcome = eventPayload(events[index]).outcome;
    if (typeof outcome === "string") return outcome as TaskOutcome;
  }
  return null;
}

type PlannedPayload = { steps?: TaskStepDefinition[]; billingUnit?: string; estimate?: unknown; billingBasis?: string };

/**
 * 取任务计划事件。
 * 注意 `updateRunStatus` 给非终态迁移也写 event_type="planned"（repository 既有行为，
 * 本轮不改它），所以这里靠「带 steps / billingBasis」认出任务计划那一条，
 * 并取最新的一条（重跑同一 run 时以最新计划为准）。
 */
function plannedPayload(events: LedgerEvent[]): PlannedPayload | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.event_type !== "planned") continue;
    const payload = eventPayload(event) as PlannedPayload;
    if (Array.isArray(payload.steps) || payload.billingBasis) return payload;
  }
  return undefined;
}

/**
 * 纯函数：把 (行状态, 结局标记, 步骤, 时间) 归约成界面六态。
 * 判定顺序固定，任何一条都能单独写断言。
 */
export function deriveTaskStatus(
  run: { status?: unknown; stopped_reason?: unknown; updated_at?: unknown },
  events: LedgerEvent[],
  clock: { now: Date | string | number; staleAfterMs?: number } = { now: new Date() },
): TaskStatus {
  const rawStatus = typeof run.status === "string" ? run.status.trim() : "";
  if (!rawStatus) throw new Error("任务台账需要 coach_runs.status，读不到就不猜状态");
  const status = normalizeRunStatus(rawStatus);
  const outcome = latestOutcome(events);
  const steps = deriveSteps(plannedPayload(events)?.steps || [], events);
  const doneCount = steps.filter((step) => step.status === "done").length;

  switch (status) {
    case "completed":
      return outcome === "partial" && doneCount > 0 ? "partial" : "done";
    case "failed":
      if (outcome === "partial" && doneCount > 0) return "partial";
      // 取消落在 saving 窗口时状态机只允许 failed，但界面该看到的是「已取消」。
      if (outcome === "cancelled") return "cancelled";
      return "failed";
    case "cancelled":
      return "cancelled";
    case "reading":
    case "ready":
      return "pending";
    case "waiting_user":
      return "running";
    case "running":
    case "saving": {
      // 没有终态写入 ⇒ 要么在跑，要么用户已经走了。用事件流水判断，而不是猜。
      const updatedAt = iso(run.updated_at) ?? null;
      const now = clock.now instanceof Date ? clock.now.getTime() : typeof clock.now === "number" ? clock.now : Date.parse(clock.now);
      const staleAfter = clock.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
      if (!Number.isFinite(now) || !updatedAt) return "running";
      if (now - Date.parse(updatedAt) < staleAfter) return "running";
      return doneCount > 0 ? "partial" : "failed";
    }
    default:
      return "running";
  }
}

function toLedger(run: DbRow, events: DbRow[], clock: { now: Date | string | number; staleAfterMs?: number }): TaskLedger {
  const planned = plannedPayload(events);
  const steps = deriveSteps(planned?.steps || [], events);
  const outcome = latestOutcome(events);
  const rawOutput = run.output ?? null;
  const terminal = ["completed", "failed", "cancelled"].includes(String(run.status));
  return {
    runId: String(run.id),
    userId: String(run.user_id),
    opportunityId: run.opportunity_id ? String(run.opportunity_id) : null,
    actionType: String(run.action_type) as CoachActionType,
    billingUnit: typeof planned?.billingUnit === "string" ? planned.billingUnit : null,
    status: deriveTaskStatus(run, events, clock),
    runStatus: normalizeRunStatus(String(run.status)) as CoachRunStatus,
    stoppedReason: (run.stopped_reason ? String(run.stopped_reason) : null) as CoachStopReason | null,
    outcome,
    steps,
    result: terminal && (outcome === "complete" || String(run.status) === "completed") ? rawOutput : null,
    partialResult:
      outcome === "partial" || (String(run.status) === "cancelled" && rawOutput !== null) || deriveTaskStatus(run, events, clock) === "partial"
        ? rawOutput
        : null,
    estimate: planned?.estimate ?? null,
    createdAt: iso(run.created_at),
    updatedAt: iso(run.updated_at),
    completedAt: iso(run.completed_at),
  };
}

export interface StartTaskInput {
  userId: string;
  task: CoachActionType;
  goal: string;
  steps: TaskStepDefinition[];
  /** 编译器产物由调用方（route 位）给；本层不新建第二套装配逻辑。 */
  context: ContextBundle;
  opportunityId?: string | null;
  billingUnit?: string | null;
  /** 事前预估（billing.estimateUnit 的产物），落进 planned 事件供事后对账。 */
  estimate?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  promptVersion?: string | null;
  requiresConfirmation?: boolean;
}

export interface StartTaskResult {
  runId: string;
  status: TaskStatus;
  /** 命中同一 idempotencyKey 的既有任务时为 true，不重复起一份。 */
  reused: boolean;
}

/**
 * 建任务：coach_runs 落一行（reading→ready），步骤计划与预估落 planned 事件。
 * 建完是「待跑」，不是「跑中」——起跑要显式 startExecution。
 */
export async function startTask(input: StartTaskInput): Promise<StartTaskResult> {
  const db = requireDb(await getDbClient());

  if (input.idempotencyKey) {
    const { data: existing, error: lookupError } = await db
      .from("coach_runs")
      .select("id, status")
      .eq("user_id", input.userId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return { runId: String(existing.id), status: deriveTaskStatus(existing as { status: unknown }, []), reused: true };
  }

  let run;
  try {
    run = await createCoachRun({
    userId: input.userId,
    opportunityId: input.opportunityId ?? null,
    task: input.task,
    executor: "hosted_api",
    goal: input.goal,
    payload: { billingUnit: input.billingUnit ?? null, steps: input.steps },
    context: input.context,
    requiresConfirmation: input.requiresConfirmation,
    promptVersion: input.promptVersion,
    idempotencyKey: input.idempotencyKey,
  });
  } catch (error) {
    // 唯一键在 INSERT 时生效；并发请求只能有一个执行者，不能先创建两条再补键。
    if (!input.idempotencyKey || (error as { code?: string })?.code !== "23505") throw error;
    const { data: existing, error: lookupError } = await db.from("coach_runs").select("id, status")
      .eq("user_id", input.userId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) throw error;
    return { runId: String(existing.id), status: deriveTaskStatus(existing as { status: unknown }, []), reused: true };
  }
  const runId = String(run.id);

  await updateRunStatus({ userId: input.userId, runId, to: "ready" });
  await appendRunEvent({
    userId: input.userId,
    runId,
    eventType: "planned",
    payload: {
      steps: input.steps,
      billingUnit: input.billingUnit ?? null,
      estimate: input.estimate ?? null,
      billingBasis: "per_task",
    },
  });

  return { runId, status: "pending", reused: false };
}

/** 待跑 → 跑中。 */
export async function startExecution(input: { userId: string; runId: string; modelCallCount?: number }) {
  await updateRunStatus({ userId: input.userId, runId: input.runId, to: "running", modelCallCount: input.modelCallCount });
  return { status: "running" as TaskStatus };
}

export async function beginStep(input: { userId: string; runId: string; stepId: string; label?: string }) {
  await appendRunEvent({
    userId: input.userId,
    runId: input.runId,
    eventType: "tool_started",
    payload: { stepId: input.stepId, label: input.label ?? input.stepId, at: new Date().toISOString() },
  });
}

export async function completeStep(input: {
  userId: string;
  runId: string;
  stepId: string;
  label?: string;
  resultDigest?: string;
  /** 步骤产物本身进产物表，这里只留指针与摘要。 */
  artifactId?: string;
}) {
  await appendRunEvent({
    userId: input.userId,
    runId: input.runId,
    eventType: "tool_completed",
    payload: {
      stepId: input.stepId,
      label: input.label ?? input.stepId,
      resultDigest: input.resultDigest ?? null,
      artifactId: input.artifactId ?? null,
      at: new Date().toISOString(),
    },
  });
}

/** 缺用户信息时挂起：持久化 checkpoint，不在后台空转（PRD §4.2）。 */
export async function waitForUser(input: { userId: string; runId: string; question: string; stepId?: string }) {
  await updateRunStatus({ userId: input.userId, runId: input.runId, to: "waiting_user", stoppedReason: "awaiting_user" });
  await appendRunEvent({
    userId: input.userId,
    runId: input.runId,
    eventType: "validation",
    payload: { awaiting: true, question: input.question, stepId: input.stepId ?? null },
  });
  return { status: "running" as TaskStatus };
}

export async function resumeTask(input: { userId: string; runId: string }) {
  await updateRunStatus({ userId: input.userId, runId: input.runId, to: "running" });
  return { status: "running" as TaskStatus };
}

/**
 * 收口：产物先落 `coach_runs.output`，再 running→saving→completed。
 * 「生成完但未持久化」不允许直接算完成，所以这里强制经过 saving。
 */
export async function completeTask(input: { userId: string; runId: string; result: unknown; modelCallCount?: number; toolCallCount?: number }) {
  const run = await loadRun(input.userId, input.runId);
  let status = normalizeRunStatus(String(run.status));
  if (status === "ready") { await startExecution(input); status = "running"; }
  if (status === "waiting_user") { await resumeTask(input); status = "running"; }
  if (status !== "running" && status !== "saving") throw new Error(`Invalid coach run transition: ${status} -> completed`);
  if (status === "running") {
    await updateRunStatus({ userId: input.userId, runId: input.runId, to: "saving", modelCallCount: input.modelCallCount, toolCallCount: input.toolCallCount });
  }
  await persistRunOutput(input.userId, input.runId, input.result);
  await updateRunStatus({ userId: input.userId, runId: input.runId, to: "completed", stoppedReason: "completed" });
  await appendRunEvent({
    userId: input.userId,
    runId: input.runId,
    eventType: "validation",
    payload: { outcome: "complete", at: new Date().toISOString() },
  });
  return { status: "done" as TaskStatus };
}

export interface FailTaskInput {
  userId: string;
  runId: string;
  reason: Extract<CoachStopReason, "timeout" | "cost_cap" | "permission_denied" | "no_evidence" | "error">;
  /** 有可用半成品就带上：FR-35 要求它可查，不是丢掉。 */
  partialResult?: unknown;
  failureType?: string;
  stepId?: string;
}

/**
 * 失败收口。带 partialResult（且确有已完成步骤）⇒ 记成「部分完成」；
 * 否则 ⇒ 「失败」。从 ready 出发时先补一跳 running，因为状态机里
 * ready 只能去 running / cancelled。
 */
export async function failTask(input: FailTaskInput) {
  const run = await loadRun(input.userId, input.runId);
  const status = normalizeRunStatus(String(run.status));
  if (["completed", "failed", "cancelled"].includes(status)) throw new Error(`Invalid coach run transition: ${status} -> failed`);
  if (status === "ready") await startExecution(input);

  const events = await loadRunEvents(input.userId, input.runId);
  const steps = deriveSteps(plannedPayload(events)?.steps || [], events);
  const doneCount = steps.filter((step) => step.status === "done").length;
  const hasPartial = input.partialResult !== undefined && input.partialResult !== null && doneCount > 0;

  if (hasPartial) {
    await persistRunOutput(input.userId, input.runId, input.partialResult);
  } else {
    // 没有可用半成品：把失败详情写进 error 列，output 保持空，界面才不会出现
    // 「有产物却是失败」这种自相矛盾的读结果。
    await persistRunError(input.userId, input.runId, {
      reason: input.reason,
      failureType: input.failureType ?? null,
      stepId: input.stepId ?? null,
    });
  }
  await appendRunEvent({
    userId: input.userId,
    runId: input.runId,
    eventType: "validation",
    payload: {
      outcome: hasPartial ? "partial" : "failed",
      reason: input.reason,
      failureType: input.failureType ?? null,
      stepId: input.stepId ?? null,
      completedSteps: doneCount,
      at: new Date().toISOString(),
    },
  });
  await updateRunStatus({ userId: input.userId, runId: input.runId, to: "failed", stoppedReason: input.reason });
  return { status: hasPartial ? ("partial" as TaskStatus) : ("failed" as TaskStatus) };
}

/**
 * 取消。reading/ready/running/waiting_user → cancelled（user_cancelled）。
 * saving 窗口状态机不给 cancelled：那里产物已在落库，按「落库失败」语义走 failed，
 * 但保留已完成的步骤结果并记 outcome=cancelled，界面仍能看到东西没丢。
 */
export async function cancelTask(input: { userId: string; runId: string; reason?: string }) {
  const run = await loadRun(input.userId, input.runId);
  const status = normalizeRunStatus(String(run.status));
  if (["completed", "failed", "cancelled"].includes(status)) throw new Error(`Invalid coach run transition: ${status} -> cancelled`);
  const events = await loadRunEvents(input.userId, input.runId);
  const steps = deriveSteps(plannedPayload(events)?.steps || [], events);
  const doneSteps = steps.filter((step) => step.status === "done");
  const hasStoredOutput = run.output !== null && run.output !== undefined;

  if (status === "saving") {
    // 状态机没有 saving→cancelled。已经有可用产物的，按「部分完成」留档；
    // 什么都没有的，按「已取消」留档。两种都把取消这个事实记进事件。
    const outcome: TaskOutcome = doneSteps.length > 0 ? "partial" : "cancelled";
    if (doneSteps.length > 0 && !hasStoredOutput) {
      await persistRunOutput(input.userId, input.runId, { cancelled: true, retainedSteps: doneSteps.map((step) => step.id) });
    }
    await appendRunEvent({
      userId: input.userId,
      runId: input.runId,
      eventType: "cancelled",
      payload: {
        reason: input.reason ?? "user_cancelled",
        outcome,
        retainedSteps: doneSteps.map((step) => step.id),
        note: "取消发生在保存窗口，状态机无 saving→cancelled，按落库语义折算",
      },
    });
    await updateRunStatus({ userId: input.userId, runId: input.runId, to: "failed", stoppedReason: "error" });
    return { status: outcome === "partial" ? ("partial" as TaskStatus) : ("cancelled" as TaskStatus) };
  }

  if (doneSteps.length > 0 && !hasStoredOutput) {
    await persistRunOutput(input.userId, input.runId, { cancelled: true, retainedSteps: doneSteps.map((step) => step.id) });
  }
  await appendRunEvent({
    userId: input.userId,
    runId: input.runId,
    eventType: "cancelled",
    payload: { reason: input.reason ?? "user_cancelled", skipNotices: true, retainedSteps: doneSteps.map((step) => step.id) },
  });
  await updateRunStatus({ userId: input.userId, runId: input.runId, to: "cancelled", stoppedReason: "user_cancelled" });
  return { status: "cancelled" as TaskStatus };
}

/** 查一个任务：关掉页面后回来查的就是它。 */
export async function getTaskLedger(input: {
  userId: string;
  runId: string;
  now?: Date | string | number;
  staleAfterMs?: number;
}): Promise<TaskLedger> {
  const [run, events] = await Promise.all([loadRun(input.userId, input.runId), loadRunEvents(input.userId, input.runId)]);
  return toLedger(run, events, { now: input.now ?? new Date(), staleAfterMs: input.staleAfterMs });
}

/** 未收口的行（关页面后等着被 reconcile 的那些）。「哪些算活跃」只有这一处定义。 */
export const OPEN_STATUSES = ["reading", "ready", "running", "waiting_user", "saving"];

/**
 * 进度托盘的订阅形状（FR-35 / W6）：只出界面要的那几列，goal 是用户看得懂的一句话。
 * 与 `listTaskLedgers` 共用 `OPEN_STATUSES`，避免「活跃」在两处各说一遍。
 */
export async function listActiveRuns(input: {
  userId: string;
  limit?: number;
}): Promise<Array<{ id: string; goal: string; status: CoachRunStatus; stopped_reason: CoachStopReason | null; updated_at: string | null; created_at: string | null }>> {
  const db = requireDb(await getDbClient());
  const { data, error } = await db
    .from("coach_runs")
    .select("id, goal, status, stopped_reason, updated_at, created_at")
    .eq("user_id", input.userId)
    .in("status", OPEN_STATUSES)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 20);
  if (error) throw error;
  return ((data || []) as DbRow[]).map((row) => ({
    id: String(row.id),
    goal: String(row.goal ?? ""),
    status: normalizeRunStatus(String(row.status)),
    stopped_reason: row.stopped_reason ? (String(row.stopped_reason) as CoachStopReason) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
    created_at: row.created_at ? String(row.created_at) : null,
  }));
}

export async function listTaskLedgers(input: {
  userId: string;
  now?: Date | string | number;
  staleAfterMs?: number;
  limit?: number;
}): Promise<TaskLedger[]> {
  const db = requireDb(await getDbClient());
  const { data: runs, error } = await db
    .from("coach_runs")
    .select("*")
    .eq("user_id", input.userId)
    .in("status", OPEN_STATUSES)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 20);
  if (error) throw error;
  const ledgers: TaskLedger[] = [];
  for (const run of (runs || []) as DbRow[]) {
    const events = await loadRunEvents(input.userId, String(run.id));
    ledgers.push(toLedger(run, events, { now: input.now ?? new Date(), staleAfterMs: input.staleAfterMs }));
  }
  return ledgers;
}

/**
 * 把超时的未收口任务落成终态，让「部分完成」在库里可见而不只是算出来的。
 * 返回处理后的台账；没有陈旧任务时返回空数组。
 */
export async function reconcileStaleTasks(input: {
  userId: string;
  now?: Date | string | number;
  staleAfterMs?: number;
  limit?: number;
}): Promise<TaskLedger[]> {
  const clock = { now: input.now ?? new Date(), staleAfterMs: input.staleAfterMs };
  const open = await listTaskLedgers({ ...input, ...clock });
  const stale = open.filter((ledger) => ledger.status === "partial" || ledger.status === "failed");
  const reconciled: TaskLedger[] = [];

  for (const ledger of stale) {
    if (ledger.runStatus === "completed" || ledger.runStatus === "failed" || ledger.runStatus === "cancelled") continue;
    const outcome: TaskOutcome = ledger.status === "partial" ? "partial" : "failed";
    if (outcome === "partial") {
      await persistRunOutput(
        ledger.userId,
        ledger.runId,
        ledger.partialResult ?? { abandoned: true, retainedSteps: ledger.steps.filter((step) => step.status === "done").map((step) => step.id) },
      );
    }
    await appendRunEvent({
      userId: ledger.userId,
      runId: ledger.runId,
      eventType: "validation",
      payload: {
        outcome,
        reason: "timeout",
        detectedBy: "reconcile_stale_tasks",
        completedSteps: ledger.steps.filter((step) => step.status === "done").length,
        at: new Date(Number(clock.now instanceof Date ? clock.now.getTime() : Date.parse(String(clock.now)))).toISOString(),
      },
    });
    // ready 没有出过字：状态机里它只能去 running/cancelled，所以补一跳再失败收口。
    if (ledger.runStatus === "ready" || ledger.runStatus === "reading") {
      await updateRunStatus({ userId: ledger.userId, runId: ledger.runId, to: "running" }).catch(() => undefined);
    }
    await updateRunStatus({ userId: ledger.userId, runId: ledger.runId, to: "failed", stoppedReason: "timeout" });
    reconciled.push({ ...ledger, runStatus: "failed", stoppedReason: "timeout", outcome });
  }
  return reconciled;
}
