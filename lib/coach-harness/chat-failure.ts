/**
 * 统一失败语义表（设计文档 §5.7 / W1 交付 4）。
 *
 * 每行 = 一类失败：用户看到什么（userCopy）、是否重试（retryable）、
 * 会不会有内容落库（persists）。表里任何一行没测过就不算实现——
 * chat-failure.test.ts 逐行断言。
 *
 * chatFailureMessage 的对外行为与迁移前逐字一致（TokenPay 原文透传、
 * 各分支文案不变）；分类顺序就是历史匹配顺序，不许重排。
 *
 * 冷却重试不再写死模型字面量：resolveCooldownRetry 返回 model-catalog
 * 的经济档常量 ECONOMY_MODEL_ID，route 接线后由它代替内联判断。
 */

import { ECONOMY_MODEL_ID } from "./model-catalog";

export type ChatFailureClass =
  | "provider_quota"
  | "repetition_abort"
  | "model_timeout"
  | "rate_limited"
  | "model_unavailable"
  | "stream_interrupted"
  | "context_budget_exceeded"
  | "quote_verification_failed"
  | "persistence_failed"
  | "subagent_failed"
  | "compression_protection_lost"
  | "unknown";

/** auto_per_routing = 按路由策略重试（冷却 + 目录档位），不写死模型。 */
export type ChatFailureRetryPolicy = "auto_per_routing" | "manual" | "none";

export interface ChatFailureRow {
  failure: ChatFailureClass;
  /** 用户看到什么。函数 = 原文透传（只透传我们自己构造的话术，绝不透传上游负载）。 */
  userCopy: string | ((message: string) => string);
  /** 是否重试：自动按路由 / 只能用户手动 / 重试无意义。 */
  retryable: ChatFailureRetryPolicy;
  /** 这条失败下会不会有内容被持久化（落库）。 */
  persists: boolean;
  /** 该行的机器判定：按表序第一个命中的 detection 定类。设计表未接线的行没有。 */
  detection?: RegExp;
  /** §5.7 行的落地状态：false = 语义已登记，主链路尚未产生该类失败。 */
  wired: boolean;
}

/** 顺序即历史匹配顺序（TokenPay 最先、缺省 unknown 最后），不许调整。 */
export const CHAT_FAILURE_TABLE: readonly ChatFailureRow[] = [
  { failure: "provider_quota", userCopy: (message) => message, retryable: "none", persists: false, detection: /TokenPay/, wired: true },
  { failure: "repetition_abort", userCopy: "导师输出重复，已停止本次回答且未保存。请重试或更换模型。", retryable: "manual", persists: false, detection: /导师输出重复/, wired: true },
  { failure: "model_timeout", userCopy: "模型响应超时。问题仍保留在输入框，可重试或选择其他模型。", retryable: "auto_per_routing", persists: false, detection: /timeout|timed\s*out|abort/i, wired: true },
  { failure: "rate_limited", userCopy: "模型当前请求较多，请稍后重试或选择其他模型。", retryable: "manual", persists: false, detection: /429|rate.?limit/i, wired: true },
  { failure: "model_unavailable", userCopy: "所选模型暂不可用，请选择其他模型后重试。", retryable: "auto_per_routing", persists: false, detection: /模型.*不可用|模型不存在|未替换模型/, wired: true },
  { failure: "stream_interrupted", userCopy: "模型未完成回答，请重试或选择其他模型。", retryable: "none", persists: false, detection: /empty response|输出中断/i, wired: true },
  // 以下为 §5.7 表补的类：detection 只命中自家构造的话术，不透传上游负载。
  { failure: "context_budget_exceeded", userCopy: "这次材料较多，暂时没能完成回答。你的档案仍然保留，请先选一个具体问题继续。", retryable: "none", persists: false, detection: /装不进 .* token 预算/, wired: true },
  { failure: "quote_verification_failed", userCopy: "这轮没有抽取到可安全使用的经历；没有出处的内容不会写成你的事实。", retryable: "none", persists: false, detection: /简历事实复核未通过/, wired: true },
  { failure: "persistence_failed", userCopy: "回答生成了，但未确认保存，请检查历史后重试。", retryable: "manual", persists: false, detection: /未确认保存/, wired: true },
  { failure: "subagent_failed", userCopy: "这块调研没跑成，先基于已有材料辅导，结果我稍后补。", retryable: "none", persists: false, wired: false },
  { failure: "compression_protection_lost", userCopy: "", retryable: "none", persists: true, wired: false },
  { failure: "unknown", userCopy: "本次回答未完成，请保留问题并重试", retryable: "manual", persists: false, wired: true },
];

export function classifyChatFailure(error: unknown): ChatFailureClass {
  const message = error instanceof Error ? error.message : "";
  for (const row of CHAT_FAILURE_TABLE) {
    if (row.detection?.test(message)) return row.failure;
  }
  return "unknown";
}

/** Public recovery copy; never leak raw upstream payloads or credentials. */
export function chatFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const row =
    CHAT_FAILURE_TABLE.find((candidate) => candidate.detection?.test(message)) ??
    CHAT_FAILURE_TABLE.find((candidate) => candidate.failure === "unknown")!;
  return typeof row.userCopy === "function" ? row.userCopy(message) : row.userCopy;
}

/** 可冷却重试的失败：与迁移前 route 内联正则逐字相同。 */
const COOLDOWN_RETRYABLE_PATTERN = /timed? ?out|timeout|abort|connection|502|503|504/i;

export interface CooldownRetryContext {
  /** 只有 auto 档允许自动换档；用户点名的模型不许被静默替换。 */
  mode: string;
  /** 已经开始出字：重试会吐重复内容，永不自动重试。 */
  receivedText: boolean;
  /** 当前实际使用的模型 id。 */
  currentModel: string;
  error: unknown;
}

/**
 * 冷却重试的目标档位：命中可重试失败、未出字、auto 档且当前不在经济档时
 * 返回 model-catalog 的经济档常量（不再是写死的模型字面量），否则 null。
 */
export function resolveCooldownRetry(ctx: CooldownRetryContext): string | null {
  const message = ctx.error instanceof Error ? ctx.error.message : "";
  if (ctx.mode !== "auto") return null;
  if (ctx.receivedText) return null;
  if (ctx.currentModel === ECONOMY_MODEL_ID) return null;
  if (!COOLDOWN_RETRYABLE_PATTERN.test(message)) return null;
  return ECONOMY_MODEL_ID;
}
