/**
 * W5 / PRD FR-35 + §5.6：按任务计费，不按请求计费。
 *
 * 三条硬规矩：
 *  1. **不发明价格**。唯一的单价来源是 `llm-telemetry.estimateGenerationCost`
 *     （目前只有 deepseek 两档，pricingVersion 写在返回值里）。目录里其它档位
 *     按 model-catalog.ts 的注释是「手工参考值、非扣费倍率」，所以一律记 unknown。
 *  2. 输入侧 token 预算取自上下文编译器的 `DEFAULT_ROUTE_BUDGET`，
 *     输出侧没有任何已落库的口径 ⇒ 预估只能给**下界**，并显式标注。
 *  3. 一次任务 = 一个计费单元，跟这一任务里调了几次模型无关。
 */

import { getDbClient } from "@/lib/db";
import { estimateGenerationCost, type GenerationUsage } from "@/lib/llm-telemetry";
import { DEFAULT_ROUTE_BUDGET, type CoachRunStatus, type RouteClass } from "../types";
import { requireDb } from "../repository";
import type { TaskLedger, TaskStatus } from "./types";

export const BILLING_UNIT_KINDS = ["job_search", "company_research"] as const;
export type BillingUnitKind = (typeof BILLING_UNIT_KINDS)[number];

export interface BillingUnitDefinition {
  kind: BillingUnitKind;
  label: string;
  /** 一次任务固定为一个计费单元。 */
  units: 1;
  routeClass: RouteClass;
  /** 任务内预期的模型调用次数上限（来自既有路由预算，不是新发明数字）。 */
  expectedModelCalls: number;
}

export const BILLING_UNITS: Record<BillingUnitKind, BillingUnitDefinition> = {
  job_search: {
    kind: "job_search",
    label: "一次岗位搜索",
    units: 1,
    routeClass: "bounded_orchestration",
    expectedModelCalls: DEFAULT_ROUTE_BUDGET.bounded_orchestration.maxModelCalls,
  },
  company_research: {
    kind: "company_research",
    label: "一次公司调研",
    units: 1,
    routeClass: "bounded_orchestration",
    expectedModelCalls: DEFAULT_ROUTE_BUDGET.bounded_orchestration.maxModelCalls,
  },
};

/** 只有 deepseek 两档在 llm-telemetry 里有单价。 */
const SOURCED_PRICING_VERSION = "deepseek-v4-2026-08-18";

export interface CostEstimate {
  billingUnit: BillingUnitKind;
  billingUnits: 1;
  routeClass: RouteClass;
  expectedModelCalls: number;
  /** 每次调用的输入 token 上限，来源：上下文编译器预算表。 */
  budgetedInputTokensPerCall: number;
  /** 整任务输入 token 预算上限（不含输出）。 */
  budgetedInputTokens: number;
  /** 输出侧无落库口径 ⇒ 永远为 null，不猜。 */
  budgetedOutputTokens: null;
  /** 下界成本（USD）；无单价来源时为 null。 */
  estimatedCostUsd: number | null;
  costBasis: typeof SOURCED_PRICING_VERSION | "unsourced";
  /** 有价时是「只算输入的下界」；无价时整个预估不可用。 */
  lowerBoundOnly: boolean;
  /** 明确写出来缺哪些数据，界面要照这个显示「以账单为准」而不是显示一个假数。 */
  unknowns: string[];
}

export interface EstimateInput {
  unit: BillingUnitKind;
  provider: string;
  model: string;
  /** 覆盖默认路由档位（调用方已知更省时可以降档预估）。 */
  routeClass?: RouteClass;
  /** 实际计划的模型调用次数，不得超过预算里的 maxModelCalls。 */
  expectedModelCalls?: number;
}

/**
 * 事前预估。可算的部分只用既有预算表 + 既有单价；
 * 算不出来的部分老老实实标 unsourced。
 */
export function estimateUnitCost(input: EstimateInput): CostEstimate {
  const definition = BILLING_UNITS[input.unit];
  const routeClass = input.routeClass ?? definition.routeClass;
  const budget = DEFAULT_ROUTE_BUDGET[routeClass];
  const expectedModelCalls = Math.min(input.expectedModelCalls ?? definition.expectedModelCalls, Math.max(1, budget.maxModelCalls));
  const budgetedInputTokensPerCall = budget.maxInputTokens;
  const budgetedInputTokens = budgetedInputTokensPerCall * expectedModelCalls;

  const unknowns = [
    "输出 token 预算：仓库里没有任何已落库的输出口径，预估不含输出侧成本。",
    "工具/检索扇出的实际次数：由子 Agent 契约（W2）在起跑时给出。",
  ];
  if (routeClass === "direct" || routeClass === "single_inference") {
    unknowns.push(`路由档位 ${routeClass} 与任务默认档位 ${definition.routeClass} 不一致，按传入档位预估。`);
  }

  const lowerBoundUsage: GenerationUsage = {
    inputTokens: budgetedInputTokens,
    outputTokens: 0,
    totalTokens: budgetedInputTokens,
    cacheHitTokens: 0,
    cacheMissTokens: budgetedInputTokens,
  };
  const priced = estimateGenerationCost(input.provider, input.model, lowerBoundUsage);
  if (priced.estimatedCostUsd === null) {
    unknowns.unshift(
      `单价：${input.provider}/${input.model} 在现有目录里没有可比价口径（model-catalog 明示为手工参考值），成本预估不可用。`,
    );
    return {
      billingUnit: input.unit,
      billingUnits: 1,
      routeClass,
      expectedModelCalls,
      budgetedInputTokensPerCall,
      budgetedInputTokens,
      budgetedOutputTokens: null,
      estimatedCostUsd: null,
      costBasis: "unsourced",
      lowerBoundOnly: true,
      unknowns,
    };
  }

  return {
    billingUnit: input.unit,
    billingUnits: 1,
    routeClass,
    expectedModelCalls,
    budgetedInputTokensPerCall,
    budgetedInputTokens,
    budgetedOutputTokens: null,
    estimatedCostUsd: priced.estimatedCostUsd,
    costBasis: SOURCED_PRICING_VERSION,
    lowerBoundOnly: true,
    unknowns,
  };
}

export interface MeteredUsage {
  calls: number;
  pricedCalls: number;
  unpricedCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHitTokens: number;
  latencyMs: number;
  /** 只有 llm-telemetry 记到数的调用才计入。 */
  meteredCostUsd: number | null;
  pricingVersions: string[];
  providerModels: string[];
  /** 计量窗口内没找到任何生成事件。 */
  empty: boolean;
}

export interface MeasureInput {
  userId: string;
  /** 首选：任务显式登记过的 request_id（见 runRequestId 约定）。 */
  requestIds?: string[];
  /** 兜底：按用户 + 时间窗 + operation 前缀聚合，归属是近似的，结果里会标 attributable:false。 */
  window?: { from: string; to: string };
  operations?: string[];
}

export interface TaskMeter extends MeteredUsage {
  /** 用量能否唯一归到这一个任务上。 */
  attributable: boolean;
  attribution: "request_ids" | "time_window";
}

function sumRows(rows: Array<Record<string, unknown>>): MeteredUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let cacheHitTokens = 0;
  let latencyMs = 0;
  let cost = 0;
  let pricedCalls = 0;
  let unpricedCalls = 0;
  const pricingVersions = new Set<string>();
  const providerModels = new Set<string>();

  for (const row of rows) {
    inputTokens += Number(row.input_tokens || 0);
    outputTokens += Number(row.output_tokens || 0);
    totalTokens += Number(row.total_tokens || 0);
    cacheHitTokens += Number(row.cache_hit_tokens || 0);
    latencyMs += Number(row.latency_ms || 0);
    providerModels.add(`${row.provider}/${row.model}`);
    if (row.estimated_cost_usd === null || row.estimated_cost_usd === undefined) {
      unpricedCalls += 1;
    } else {
      pricedCalls += 1;
      cost += Number(row.estimated_cost_usd);
    }
    if (typeof row.pricing_version === "string" && row.pricing_version) pricingVersions.add(row.pricing_version);
  }

  return {
    calls: rows.length,
    pricedCalls,
    unpricedCalls,
    inputTokens,
    outputTokens,
    totalTokens,
    cacheHitTokens,
    latencyMs,
    meteredCostUsd: rows.length === 0 || pricedCalls === 0 ? null : cost,
    pricingVersions: [...pricingVersions],
    providerModels: [...providerModels],
    empty: rows.length === 0,
  };
}

/**
 * 事后计量。
 * 归属口径说明：`ai_generation_events` 没有 run_id 列（本轮不改库），
 * 所以按 request_id 精确归集需要调用方把 runRequestId 当作 x-idempotency-key 传下去；
 * 拿不到时退回时间窗聚合，并在返回值里标 attributable:false。
 */
export async function measureTaskMeter(input: MeasureInput): Promise<TaskMeter> {
  const db = requireDb(await getDbClient());
  const requestIds = (input.requestIds || []).filter((id) => typeof id === "string" && id.length);

  if (requestIds.length) {
    const { data, error } = await db
      .from("ai_generation_events")
      .select("*")
      .eq("user_id", input.userId)
      .in("request_id", requestIds);
    if (error) throw error;
    return { ...sumRows((data || []) as Array<Record<string, unknown>>), attributable: true, attribution: "request_ids" };
  }

  if (!input.window) throw new Error("计量任务成本需要 requestIds 或时间窗");
  let query = db
    .from("ai_generation_events")
    .select("*")
    .eq("user_id", input.userId)
    .gte("created_at", input.window.from)
    .lte("created_at", input.window.to);
  if (input.operations?.length) query = query.in("operation", input.operations);
  const { data, error } = await query;
  if (error) throw error;
  return { ...sumRows((data || []) as Array<Record<string, unknown>>), attributable: false, attribution: "time_window" };
}

/**
 * 任务级 request_id 约定：只含 [a-zA-Z0-9_-]，长度 ≤180，
 * 与 withMeteredAiRoute 的 x-idempotency-key 校验规则一致，可直接透传。
 */
export function runRequestId(runId: string, stepId: string): string {
  const compact = `${runId}-${stepId}`.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  return compact.slice(0, 180);
}

export type ReconciliationStatus = "matched" | "under_budget" | "over_budget" | "unmetered" | "unestimated";

/** 应收口径：单元类型 + 这次到底收不收。由 billableUnitsForLedger 给出，对账不得自行推断。 */
export interface TaskSettlement {
  billingUnit: BillingUnitKind | null;
  billingUnits: number;
}

export interface CostReconciliation extends TaskSettlement {
  estimatedCostUsd: number | null;
  meteredCostUsd: number | null;
  /** 两者都有数才有；否则说明为什么对不上。 */
  deltaUsd: number | null;
  varianceRatio: number | null;
  status: ReconciliationStatus;
  notes: string[];
}

/** 超出预估 20% 以上才算超支，避免下界预估处处「超支」。 */
export const OVER_BUDGET_RATIO = 0.2;

export function reconcileTaskCost(estimate: CostEstimate | null, meter: TaskMeter | null, settlement: TaskSettlement): CostReconciliation {
  const notes: string[] = [];
  if (!estimate) {
    notes.push("事前没有预估记录（planned 事件里缺 estimate）。");
  } else if (estimate.estimatedCostUsd === null) {
    notes.push(`预估不可用：${estimate.costBasis === "unsourced" ? "该模型在现有目录里没有单价来源" : "预估缺失"}。`);
    notes.push(...estimate.unknowns);
  } else if (estimate.lowerBoundOnly) {
    notes.push("预估是只含输入 token 的下界，实际账单必然不低于它。");
  }
  if (!meter || meter.empty) notes.push("计量窗口内没有生成事件：可能是埋点没接上，不能当成零成本。");
  if (meter && meter.unpricedCalls > 0) {
    notes.push(`${meter.unpricedCalls} 次调用没有单价来源，计量只覆盖 ${meter.pricedCalls} 次。`);
  }
  if (meter && !meter.attributable) notes.push("按时间窗聚合，用量未唯一归属到本任务。");

  const { billingUnit, billingUnits } = settlement;
  const estimated = estimate?.estimatedCostUsd ?? null;
  const metered = meter?.meteredCostUsd ?? null;
  if (estimated === null || metered === null) {
    return {
      billingUnit,
      billingUnits,
      estimatedCostUsd: estimated,
      meteredCostUsd: metered,
      deltaUsd: null,
      varianceRatio: null,
      status: estimated === null && metered === null ? "unmetered" : estimated === null ? "unestimated" : "unmetered",
      notes,
    };
  }
  const delta = metered - estimated;
  const varianceRatio = estimated === 0 ? null : delta / estimated;
  if (delta < 0) {
    // 预估是下界，实测反而更低只能说明计量不完整——不能当成省钱。
    notes.push("实测低于下界预估：埋点或用量归属不完整，别读成成本下降。");
  }
  const status: ReconciliationStatus =
    delta === 0
      ? "matched"
      : varianceRatio === null || varianceRatio > OVER_BUDGET_RATIO
        ? // 预估为 0 却有实测消耗：没有任何下界能兜住它，只能算超支。
          "over_budget"
        : "under_budget";
  return {
    billingUnit,
    billingUnits,
    estimatedCostUsd: estimated,
    meteredCostUsd: metered,
    deltaUsd: delta,
    varianceRatio,
    status,
    notes,
  };
}

/**
 * 计费单元归集：一次任务算一单元，与内部模型调用次数无关。
 * 只有拿到结果的才收单元；失败/取消不收（与 finalizeQuota(success=false) 的退款语义一致）。
 */
export function billableUnitsForStatus(status: TaskStatus): number {
  return status === "done" || status === "partial" ? 1 : 0;
}

/** 从台账本身算应收单元，避免调用方自己判断。 */
export function billableUnitsForLedger(ledger: TaskLedger): { billingUnits: number; billingUnit: BillingUnitKind | null } {
  const billingUnit = ledger.billingUnit && (BILLING_UNIT_KINDS as readonly string[]).includes(ledger.billingUnit)
    ? (ledger.billingUnit as BillingUnitKind)
    : null;
  return { billingUnits: billingUnit ? billableUnitsForStatus(ledger.status) : 0, billingUnit };
}

/** planned 事件里能不能还原出预估。 */
export function estimateFromLedger(ledger: TaskLedger): CostEstimate | null {
  const estimate = ledger.estimate as CostEstimate | null;
  return estimate && typeof estimate === "object" && "billingUnit" in estimate ? estimate : null;
}

/**
 * 一个任务的完整对账：应收单元 + 事前预估 + 事后计量。
 * 界面（W6）拿这个显示「本次任务：1 个计费单元，预估 ≤$x / 实测 $y」。
 */
export async function settleTaskCost(input: {
  ledger: TaskLedger;
  requestIds?: string[];
  window?: { from: string; to: string };
  operations?: string[];
}): Promise<{ reconciliation: CostReconciliation; meter: TaskMeter | null }> {
  const settlement = billableUnitsForLedger(input.ledger);
  const estimate = estimateFromLedger(input.ledger);
  let meter: TaskMeter | null = null;
  if (input.requestIds?.length || input.window) {
    meter = await measureTaskMeter({ userId: input.ledger.userId, requestIds: input.requestIds, window: input.window, operations: input.operations });
  }
  const reconciliation = reconcileTaskCost(estimate, meter, settlement);
  // 不收单元时也要说清楚为什么：失败/取消的任务照旧产生了模型消耗。
  if (settlement.billingUnits === 0 && settlement.billingUnit && meter && !meter.empty) {
    reconciliation.notes.push(`本任务不计费（状态 ${input.ledger.status}），但已产生 ${meter.calls} 次模型调用，成本仍需归因。`);
  }
  return { reconciliation, meter };
}

/**
 * 把任务状态翻译成停止原因（写库时的合法值）。
 * 注意：CoachStopReason 没有 partial，所以「部分完成」永远走 failed + outcome 标记。
 */
export function stopReasonForStatus(status: CoachRunStatus): string | null {
  return status === "completed" ? "completed" : status === "cancelled" ? "user_cancelled" : status === "failed" ? "error" : null;
}
