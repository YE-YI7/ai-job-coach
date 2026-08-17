import { classifyGenerationFailure, estimateGenerationCost, normalizeGenerationUsage } from "./llm-telemetry";

describe("LLM telemetry", () => {
  test("normalizes provider usage without storing prompts", () => {
    expect(normalizeGenerationUsage({
      prompt_tokens: 1000,
      completion_tokens: 200,
      prompt_cache_hit_tokens: 600,
      prompt_cache_miss_tokens: 400,
    })).toEqual({ inputTokens: 1000, outputTokens: 200, totalTokens: 1200, cacheHitTokens: 600, cacheMissTokens: 400 });
  });

  test("estimates DeepSeek v4 flash cost from current price components", () => {
    const result = estimateGenerationCost("deepseek", "deepseek-v4-flash", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      totalTokens: 2_000_000,
      cacheHitTokens: 250_000,
      cacheMissTokens: 750_000,
    });
    expect(result.pricingVersion).toBe("deepseek-v4-2026-08-18");
    expect(result.estimatedCostUsd).toBeCloseTo(0.3857, 6);
  });

  test.each([
    [new Error("LLM_REQUEST_TIMEOUT"), "timeout"],
    [{ status: 429 }, "rate_limit"],
    [{ code: "invalid_api_key" }, "authentication"],
    [{ status: 503 }, "provider_error"],
  ])("classifies failures", (error, expected) => {
    expect(classifyGenerationFailure(error)).toBe(expected);
  });
});
