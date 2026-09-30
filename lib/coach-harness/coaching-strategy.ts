import { observeState, type StateSignals } from "./subagents/state-observation";

/** Browser response time measures user thinking, never model/network latency. Missing is unknown. */
export function responseTime(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 30 * 60 * 1000 ? Math.round(value) : null;
}
export function coachingStrategy(message: string, measuredResponseTimes: unknown[], opportunityId: string) {
  const signals: StateSignals = { accuracyRate: null, offTopicCount: 0, proactiveFollowUps: 0,
    responseLatencyMs: measuredResponseTimes.map(responseTime).filter((v): v is number => v !== null).slice(-8) };
  const observed = observeState({ signals, opportunityId,
    budget: { maxSourceCalls: 0, maxTokens: 0, maxWallClockMs: 0, idempotencyKey: "phrasing" } });
  if (observed.status === "failed") throw Error("Unexpected state observation failure");
  // Explicit teaching request is stronger evidence than a guessed score or emotion.
  const explicitHelp = /没(做|搞|学)过|不会|没听懂|没懂|不理解|教我|教一下|讲慢点|太复杂/.test(message);
  const product = explicitHelp ? { ...observed.product!, strategy: "lower_density" as const, reason: "用户明确请求从基础讲解", insufficientSignals: false } : observed.product!;
  return { signals, product, text: product.strategy === "lower_density"
    ? "本轮先讲一个概念，分短段配一个明确标注的练习示例，再让用户尝试一小步；用户说不会就直接教，不重复问经历。"
    : product.strategy === "direct_explain" ? "直接讲新增知识，不重讲已掌握内容。" : "按正常节奏继续，只依据用户明确提供的信息，不猜测能力与情绪。" };
}
