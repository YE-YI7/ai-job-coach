/**
 * 状态观测子 Agent（state-observation）。PRD 契约表第五行 + FR-19：
 * 输入 = 回答积极性、响应时长、答对率、是否跑题（有界的结构化信号）；
 * 输出 = 下一轮辅导策略建议（多追问 / 直接讲 / 降密度）。
 *
 * 两条契约红线：
 * 1. 纯确定性统计优先，不调模型（本文件没有任何异步源、没有任何注入依赖）；
 * 2. 调整只影响下一轮表述，**不写用户档案**——产物类型里没有 claim 字段，
 *    `writesProfile: false` 是字面量类型，构造不出 true。
 * 信号不足就按默认策略走，不猜测用户情绪（失败口径 = 话术「不猜测」，
 * 所以这里连失败分支都没有：只可能 ok 或 no_result 的默认策略）。
 */
import { assertStructuredInput, type BudgetSpec, type SubAgentOutcome } from "./contract";

export interface StateSignals {
  /** 最近答对率，0–1；缺失传 null。 */
  accuracyRate: number | null;
  /** 最近 n 次响应时长（毫秒），有界数组。 */
  responseLatencyMs: number[];
  /** 明显跑题次数。 */
  offTopicCount: number;
  /** 用户主动追问/补充的次数（积极性代理指标）。 */
  proactiveFollowUps: number;
}

export interface StateObservationInput {
  signals: StateSignals;
  opportunityId: string;
  budget: BudgetSpec;
}

export type CoachingStrategy = "more_questions" | "direct_explain" | "lower_density" | "default";

export interface StateObservationProduct {
  strategy: CoachingStrategy;
  /** 每个策略都带命中字段与理由，供复核。 */
  matchedField: keyof StateSignals | "insufficient";
  reason: string;
  insufficientSignals: boolean;
  /** 契约红线：本产物永远不会写档案。类型层写死 false。 */
  writesProfile: false;
  affectedScope: "next_turn_phrasing";
}

/** 走默认策略的话术：不猜测用户情绪。 */
export const STATE_DEFAULT_COPY = "状态信号还不够，先按默认节奏讲。";

export const MIN_SIGNAL_SAMPLES = 3;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 纯函数：阈值固定、优先序固定（跑题 → 答对率 → 时长 → 积极性 → 默认）。 */
export function observeState(input: StateObservationInput): SubAgentOutcome<StateObservationProduct> {
  assertStructuredInput(input);
  const { signals, budget } = input;
  const latency = mean(signals.responseLatencyMs);
  const sampleCount =
    signals.responseLatencyMs.length + (signals.accuracyRate !== null ? 1 : 0)
    + (signals.offTopicCount > 0 ? 1 : 0) + (signals.proactiveFollowUps > 0 ? 1 : 0);

  const usage = {
    billingUnits: 0,
    sourceCalls: 0,
    tokens: 0,
    wallClockMs: 0,
    budget,
  };

  const productOf = (
    strategy: CoachingStrategy,
    matchedField: StateObservationProduct["matchedField"],
    reason: string,
    insufficientSignals: boolean,
  ): SubAgentOutcome<StateObservationProduct> => {
    const product: StateObservationProduct = {
      strategy,
      matchedField,
      reason,
      insufficientSignals,
      writesProfile: false,
      affectedScope: "next_turn_phrasing",
    };
    return insufficientSignals
      ? {
          status: "degraded",
          idempotencyKey: budget.idempotencyKey,
          usage,
          product,
          degradation: { what: "insufficient_signals", userCopy: STATE_DEFAULT_COPY },
        }
      : { status: "ok", idempotencyKey: budget.idempotencyKey, usage, product };
  };

  if (sampleCount < MIN_SIGNAL_SAMPLES) {
    return productOf("default", "insufficient", `可用信号样本 ${sampleCount} 条 < ${MIN_SIGNAL_SAMPLES}，走默认策略，不猜测用户情绪`, true);
  }
  if (signals.offTopicCount >= 2) {
    return productOf("lower_density", "offTopicCount", `本轮跑题 ${signals.offTopicCount} 次，先降信息密度`, false);
  }
  if (signals.accuracyRate !== null && signals.accuracyRate >= 0.7 && signals.proactiveFollowUps >= 2) {
    return productOf("direct_explain", "accuracyRate", `答对率 ${(signals.accuracyRate * 100).toFixed(0)}% 且有主动追问，直接讲增量知识`, false);
  }
  if (signals.accuracyRate !== null && signals.accuracyRate < 0.4) {
    return productOf("more_questions", "accuracyRate", `答对率 ${(signals.accuracyRate * 100).toFixed(0)}%，多用追问带而不是灌输`, false);
  }
  if (latency !== null && latency > 120_000) {
    return productOf("lower_density", "responseLatencyMs", `平均响应 ${Math.round(latency / 1000)} 秒偏长，缩短单轮内容`, false);
  }
  return productOf("default", "insufficient", "信号齐全但没有显著偏向，按默认节奏", false);
}
