/**
 * W5 台账层的对外出口。
 *
 * 接线方式（给 route 位 / W6）：
 *   startTask → startExecution → beginStep/completeStep… → completeTask | failTask | cancelTask
 *   页面回来先 getTaskLedger / listTaskLedgers，必要时 reconcileStaleTasks 把陈旧行落成终态；
 *   收口后用 intakeEvent 投递事件，readInboundEvents + renderInboundEventsForAgent 交给主 Agent；
 *   起跑前 estimateUnitCost 报价、收口后 settleTaskCost 对账。
 *
 * 本层不改 app/api/coach/agent/route.ts，也不新建第二套上下文装配：
 * context 由调用方从 compileContextBundle 拿过来直接传进 startTask。
 */

export {
  BILLING_UNITS,
  BILLING_UNIT_KINDS,
  OVER_BUDGET_RATIO,
  billableUnitsForLedger,
  billableUnitsForStatus,
  estimateUnitCost,
  estimateFromLedger,
  measureTaskMeter,
  reconcileTaskCost,
  runRequestId,
  settleTaskCost,
  stopReasonForStatus,
  type BillingUnitKind,
  type CostEstimate,
  type CostReconciliation,
  type EstimateInput,
  type MeasureInput,
  type ReconciliationStatus,
  type TaskMeter,
  type TaskSettlement,
} from "./billing";
export {
  INBOUND_EVENT_TEXT_MAX,
  LEDGER_EVENT_CATALOG,
  LEDGER_EVENT_KINDS,
  intakeEvent,
  ledgerEventName,
  readInboundEvents,
  renderInboundEventsForAgent,
  sanitizeLedgerEventProperties,
  taskResultKindForLedger,
  type InboundEvent,
  type IntakeResult,
  type LedgerEventCategory,
  type LedgerEventKind,
} from "./events";
export {
  DEFAULT_STALE_AFTER_MS,
  OPEN_STATUSES,
  beginStep,
  cancelTask,
  completeStep,
  completeTask,
  deriveSteps,
  deriveTaskStatus,
  failTask,
  getTaskLedger,
  listActiveRuns,
  listTaskLedgers,
  reconcileStaleTasks,
  resumeTask,
  startExecution,
  startTask,
  waitForUser,
  type FailTaskInput,
  type StartTaskInput,
  type StartTaskResult,
} from "./lifecycle";
export { appendRunEvent } from "./lifecycle";
export type { TaskLedger, TaskOutcome, TaskStatus, TaskStepDefinition, TaskStepState } from "./types";
export { TASK_STATUSES } from "./types";
