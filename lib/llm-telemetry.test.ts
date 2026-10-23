import { classifyGenerationFailure, estimateGenerationCost, estimateLegacyUnitCost, normalizeGenerationUsage } from "./llm-telemetry";

describe("LLM telemetry", () => {
  test("normalizes provider usage without storing prompts", () => {
    expect(normalizeGenerationUsage({
      prompt_tokens: 1000,
      completion_tokens: 200,
      prompt_cache_hit_tokens: 600,
      prompt_cache_miss_tokens: 400,
    })).toEqual({ inputTokens: 1000, outputTokens: 200, totalTokens: 1200, cacheHitTokens: 600, cacheMissTokens: 400,cacheHitReported:true,reported:true });
  });

  test("estimates DeepSeek v4 flash cost from current price components", () => {
    const result = estimateGenerationCost("deepseek", "deepseek-v4-flash", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      totalTokens: 2_000_000,
      cacheHitTokens: 250_000,
      cacheMissTokens: 750_000,
    });
    expect(result.pricingVersion).toBe("deepseek/2026-10-23/peak-upper-bound");
    expect(result.estimatedCostUsd).toBeCloseTo(1.4265, 6);
  });

  test.each([
    {cached_tokens:600},
    {prompt_tokens_details:{cached_tokens:600}},
    {input_tokens_details:{cached_tokens:600}},
    {cache_read_input_tokens:600},
  ])('collects native and compatible cached-input usage: %j',cache=>{
    expect(normalizeGenerationUsage({prompt_tokens:1000,completion_tokens:200,...cache})).toMatchObject({cacheHitTokens:600,cacheMissTokens:400,cacheHitReported:true,totalTokens:1200});
  });

  test('zero is reported, missing cache is unknown, impossible values are not discounts',()=>{
    expect(normalizeGenerationUsage({prompt_tokens:1000,completion_tokens:200,cached_tokens:0})).toMatchObject({cacheHitTokens:0,cacheMissTokens:1000,cacheHitReported:true});
    expect(normalizeGenerationUsage({prompt_tokens:1000,completion_tokens:200,prompt_cache_miss_tokens:0})).toMatchObject({cacheHitTokens:1000,cacheMissTokens:0,cacheHitReported:true});
    for(const cached_tokens of [undefined,null,-10,NaN,Infinity,2000,'nope',true]){
      const usage=normalizeGenerationUsage({prompt_tokens:1000,completion_tokens:200,cached_tokens});
      expect(usage).toMatchObject({cacheHitTokens:0,cacheMissTokens:1000,cacheHitReported:false});
      expect(estimateGenerationCost('stepfun','step-3.7-flash',usage).pricingVersion).toContain('cache-unknown-upper-bound');
    }
  });

  test('cache categories partition input and do not double-count private reasoning output',()=>{
    expect(normalizeGenerationUsage({prompt_tokens:1000,completion_tokens:200,prompt_cache_hit_tokens:600,prompt_cache_miss_tokens:900,completion_tokens_details:{reasoning_tokens:150},total_tokens:100})).toMatchObject({inputTokens:1000,outputTokens:200,totalTokens:1200,cacheHitTokens:600,cacheMissTokens:400});
  });

  test('direct Step and TokenDance retain distinct tariffs and an explicit FX assumption',()=>{
    const usage=normalizeGenerationUsage({prompt_tokens:1_000_000,completion_tokens:1_000_000,cached_tokens:250_000});
    const step=estimateGenerationCost('stepfun','step-3.7-flash',usage);
    const gateway=estimateGenerationCost('tokendance','step-3.7-flash',usage);
    expect(step.estimatedCostUsd).toBeCloseTo((0.75*1.35+0.25*0.27+8.1)/7.2,10);
    expect(gateway.estimatedCostUsd).toBeCloseTo((0.75*1.08+0.25*0.216+6.48)/7.2,10);
    expect(step.pricingVersion).toBe('stepfun/2026-10-23/reference/cny-usd-fx7.2');
    expect(gateway.pricingVersion).toBe('tokendance/2026-10-23/reference/cny-usd-fx7.2');
    expect(estimateGenerationCost('stepfun','step-5-preview',usage).estimatedCostUsd).toBeCloseTo((0.75*7+0.25*0.7+20)/7.2,10);
  });

  test.each(['deepseek-v4-flash','deepseek-v4.1-flash','deepseek-v4-flash-0731','glm-5.3','kimi-k3','qwen3.8-max-0902','hy4-preview'])('prices observed gateway %s, not a guessed vendor tariff',model=>{
    const priced=estimateGenerationCost('tokendance',model,normalizeGenerationUsage({prompt_tokens:1000,completion_tokens:100,cached_tokens:0}));
    expect(priced.estimatedCostUsd).toBeGreaterThan(0);expect(priced.pricingVersion).toMatch(/^tokendance\/2026-10-23\//);
  });

  test('unknown model/provider and absent usage never produce a fabricated zero-cost success',()=>{
    const known=normalizeGenerationUsage({prompt_tokens:1000,completion_tokens:200});
    for(const [provider,model] of [['stepfun','future-flash'],['other','step-3.7-flash'],['deepseek','deepseek-chat'],['deepseek','deepseek-reasoner'],['__proto__','constructor']])expect(estimateGenerationCost(provider,model,known)).toEqual({estimatedCostUsd:null,pricingVersion:null});
    for(const raw of [null,undefined,{}, {prompt_tokens:100}])expect(estimateGenerationCost('stepfun','step-3.7-flash',normalizeGenerationUsage(raw))).toEqual({estimatedCostUsd:null,pricingVersion:null});
  });

  test('legacy quote reference is frozen; telemetry changes do not change existing billing rules',()=>{
    const usage=normalizeGenerationUsage({prompt_tokens:1_000_000,completion_tokens:1_000_000,prompt_cache_hit_tokens:250_000});
    expect(estimateLegacyUnitCost('deepseek','deepseek-v4-flash',usage)).toEqual({estimatedCostUsd:0.3857,pricingVersion:'deepseek-v4-2026-08-18'});
    expect(estimateLegacyUnitCost('stepfun','step-3.7-flash',usage)).toEqual({estimatedCostUsd:null,pricingVersion:null});
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
