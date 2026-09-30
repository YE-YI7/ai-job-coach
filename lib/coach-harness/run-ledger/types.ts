/**
 * W5 / PRD FR-35：多步任务的台账类型。
 *
 * 真相存储仍然是 `coach_runs` + `coach_run_events`，这里只是把它们
 * 翻译成界面能订阅的六态：待跑 / 跑中 / 部分完成 / 失败 / 完成 + 取消。
 *
 * 为什么需要「翻译」：`CoachRunStatus` 里没有 partial 这个值
 * （数据库 CHECK 约束也只收那八个），`CoachStopReason` 同样没有。
 * 所以「部分完成」在这里是一个**结果标记（outcome）**，落在 run 事件里，
 * 行状态仍然走合法迁移：有可用半成品 ⇒ `failed` + `outcome:"partial"`，
 * 读侧再把 (行状态, outcome, 已完成步骤) 归约成界面六态。
 */

import type { CoachActionType, CoachRunStatus, CoachStopReason } from "../types";

/** 界面订阅的六态（FR-35）。 */
export type TaskStatus = "pending" | "running" | "partial" | "failed" | "done" | "cancelled";

export const TASK_STATUSES: readonly TaskStatus[] = ["pending", "running", "partial", "failed", "done", "cancelled"];

/** 任务结局。写进 run 事件，是 partial 与 done/failed 的区分依据。 */
export type TaskOutcome = "complete" | "partial" | "failed" | "cancelled";

export type StepStatus = "pending" | "running" | "done" | "skipped";

export interface TaskStepDefinition {
  id: string;
  label: string;
}

export interface TaskStepState extends TaskStepDefinition {
  status: StepStatus;
  /** 只存摘要（条数、公司名之类元数据），大对象留在产物表里。 */
  resultDigest?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskLedger {
  runId: string;
  userId: string;
  opportunityId: string | null;
  actionType: CoachActionType;
  /** 计费单元（FR-35 / §5.6）；一次岗位搜索或一次公司调研各一个单元。 */
  billingUnit: string | null;
  /** 界面六态。 */
  status: TaskStatus;
  /** 原始行状态与停止原因，审计与排查用。 */
  runStatus: CoachRunStatus;
  stoppedReason: CoachStopReason | null;
  outcome: TaskOutcome | null;
  steps: TaskStepState[];
  /** 完成时的结果。 */
  result: unknown;
  /** 部分完成时已经拿到的东西——绝不静默丢弃（FR-35 验收）。 */
  partialResult: unknown;
  /** 事前预估（计费单元 + token 预算），与事后计量对账用。 */
  estimate: unknown;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}
