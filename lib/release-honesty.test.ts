import { buildProductEventWrite } from "./product-events";
import { pickHostedOrFallback, pickEconomySubstitute } from "./coach-harness/chat-models";
import { intersectHostedChat, TIER_LABEL } from "./coach-harness/model-catalog";

// Release-gating honesty fixes: login tracking must not depend on the anon
// migration; a genuinely hosted model must never be silently substituted; and
// "auto" must not be badged as a free tier.
describe("buildProductEventWrite (anon-migration ordering guard)", () => {
  const base = {
    name: "offer_calc_used",
    clientEventId: "abcd1234efgh",
    occurredAt: "2026-09-18T00:00:00.000Z",
    properties: { source: "direct" },
  };

  it("logged-in events use only classic columns + (user_id,client_event_id) dedup", () => {
    const { row, onConflict } = buildProductEventWrite({ ...base, userId: "u-1", anonId: null });
    expect(onConflict).toBe("user_id,client_event_id");
    expect(row.user_id).toBe("u-1");
    // Must NOT reference anon_id/event_identity so it works without the migration.
    expect(row).not.toHaveProperty("anon_id");
    expect(row).not.toHaveProperty("event_identity");
  });

  it("anonymous events use anon_id + the identity-based dedup", () => {
    const { row, onConflict } = buildProductEventWrite({ ...base, userId: null, anonId: "a".repeat(36) });
    expect(onConflict).toBe("event_identity,client_event_id");
    expect(row.user_id).toBeNull();
    expect(row.anon_id).toBe("a".repeat(36));
  });

  it("a logged-in event ignores anonId (never downgrades to the anon path)", () => {
    const { row, onConflict } = buildProductEventWrite({ ...base, userId: "u-2", anonId: "zzzzzzzzzz" });
    expect(onConflict).toBe("user_id,client_event_id");
    expect(row).not.toHaveProperty("anon_id");
  });
});

describe("pickHostedOrFallback (no silent model rewrite)", () => {
  const hosted = ["qwen3.8-max-0902", "deepseek-v4-pro", "deepseek-v4-flash"];

  it("keeps a hosted model even when the curated picker does not offer it", () => {
    expect(pickHostedOrFallback("deepseek-v4-pro", hosted)).toEqual({
      model: "deepseek-v4-pro",
      substituted: false,
    });
  });

  it("rejects an unavailable model instead of silently selecting a different tier", () => {
    expect(()=>pickHostedOrFallback("deepseek-chat", hosted)).toThrow("未替换模型");
  });

  it("never invents a Flash model absent from the gateway", () => {
    expect(()=>pickHostedOrFallback("deepseek-chat", ["glm-5.3"])).toThrow("当前不可用");
  });
});

describe("pickEconomySubstitute (economy fallback never bills high tier)", () => {
  it("prefers a flash/economy model over an expensive one in the same family", () => {
    // Gateway dropped deepseek-v4-flash; Pro is present but must not be chosen.
    const hosted = ["deepseek-v4-pro", "deepseek-v4-flash-0731", "glm-5.3"];
    expect(pickEconomySubstitute(hosted)).toBe("deepseek-v4-flash-0731");
  });

  it("returns null when only expensive models remain", () => {
    expect(pickEconomySubstitute(["deepseek-v4-pro", "kimi-k3", "qwen3.8-max-0902"])).toBeNull();
  });

  it("accepts any cheap-tier substitute when no flash is available", () => {
    expect(pickEconomySubstitute(["deepseek-v3.2", "glm-5.3"])).toBe("deepseek-v3.2");
  });
});

describe("intersectHostedChat + honest tiers", () => {
  it("keeps every chat-completion-capable gateway model, curated or not", () => {
    const models = [
      { id: "deepseek-v4-pro", supported_protocols: ["openai:chat-completions"] },
      { id: "some-image-model", supported_protocols: ["openai:images"] },
      { id: "qwen3.8-max-0902", supported_protocols: ["openai:chat-completions"] },
    ];
    expect(intersectHostedChat(models).sort()).toEqual(["deepseek-v4-pro", "qwen3.8-max-0902"]);
  });

  it("exposes an 'auto' tier label so auto is never badged 免费档", () => {
    expect(TIER_LABEL.auto).toBeDefined();
    expect(TIER_LABEL.auto).not.toBe(TIER_LABEL.free);
  });
});
