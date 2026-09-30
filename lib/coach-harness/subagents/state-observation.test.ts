import { observeState, STATE_DEFAULT_COPY, type StateObservationInput } from "./state-observation";
import { mainPromptPayloadFor, TranscriptInputError, type BudgetSpec } from "./contract";

const budget: BudgetSpec = { maxSourceCalls: 0, maxTokens: 0, maxWallClockMs: 1000, idempotencyKey: "so-1" };

function input(signals: StateObservationInput["signals"], over: Partial<StateObservationInput> = {}): StateObservationInput {
  return { signals, opportunityId: "opp1", budget, ...over };
}

describe("FR-19 状态观测：确定性统计 + 只影响下一轮表述", () => {
  it("信号不足 → 默认策略（degraded），话术不猜测情绪", () => {
    const r = observeState(input({ accuracyRate: null, responseLatencyMs: [], offTopicCount: 0, proactiveFollowUps: 0 }));
    expect(r.status).toBe("degraded");
    const payload = mainPromptPayloadFor(r);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.note).toBe(STATE_DEFAULT_COPY);
    expect(payload.product.strategy).toBe("default");
    expect(payload.product.insufficientSignals).toBe(true);
  });

  it("跑题 ≥2 → 降密度；带命中字段与理由", () => {
    const r = observeState(input({ accuracyRate: 0.5, responseLatencyMs: [1000, 2000, 1500], offTopicCount: 2, proactiveFollowUps: 0 }));
    if (r.status !== "ok") throw new Error("unexpected");
    expect(r.product.strategy).toBe("lower_density");
    expect(r.product.matchedField).toBe("offTopicCount");
    expect(r.product.reason).toContain("降信息密度");
  });

  it("答对率高且有主动追问 → 直接讲", () => {
    const r = observeState(input({ accuracyRate: 0.8, responseLatencyMs: [1000, 2000], offTopicCount: 0, proactiveFollowUps: 2 }));
    if (r.status !== "ok") throw new Error("unexpected");
    expect(r.product.strategy).toBe("direct_explain");
  });

  it("答对率低 → 多追问；响应超长 → 降密度；都不明显 → default", () => {
    const low = observeState(input({ accuracyRate: 0.3, responseLatencyMs: [1000, 2000], offTopicCount: 0, proactiveFollowUps: 0 }));
    if (low.status !== "ok") throw new Error("unexpected");
    expect(low.product.strategy).toBe("more_questions");
    const slow = observeState(input({ accuracyRate: 0.55, responseLatencyMs: [200_000, 300_000, 100_000], offTopicCount: 0, proactiveFollowUps: 0 }));
    if (slow.status !== "ok") throw new Error("unexpected");
    expect(slow.product.strategy).toBe("lower_density");
    const plain = observeState(input({ accuracyRate: 0.55, responseLatencyMs: [1000], offTopicCount: 1, proactiveFollowUps: 1 }));
    if (plain.status !== "ok") throw new Error("unexpected");
    expect(plain.product.strategy).toBe("default");
  });

  it("契约红线：产物不写用户档案，作用域只限下一轮表述", () => {
    const r = observeState(input({ accuracyRate: 0.8, responseLatencyMs: [1, 2, 3], offTopicCount: 0, proactiveFollowUps: 3 }));
    if (r.status !== "ok") throw new Error("unexpected");
    expect(r.product.writesProfile).toBe(false);
    expect(r.product.affectedScope).toBe("next_turn_phrasing");
  });

  it("整段对话灌入 → 拒绝（运行时闸门）", () => {
    const duck = { ...input({ accuracyRate: 0.5, responseLatencyMs: [1, 2, 3], offTopicCount: 0, proactiveFollowUps: 0 }), messages: [{ role: "user", content: "x" }] } as unknown as StateObservationInput;
    expect(() => observeState(duck)).toThrow(TranscriptInputError);
  });
});
