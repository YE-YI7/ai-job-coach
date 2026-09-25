import { buildChatCompletionRequest, tokenDanceRecoveryActionFromError } from "./llm";

describe("DeepSeek completion request", () => {
  const messages = [{ role: "user" as const, content: "return json" }];
  test("GLM 5.3 uses supported low reasoning instead of the max default", () => {
    expect(buildChatCompletionRequest(messages,"tokendance","glm-5.3")).toMatchObject({thinking:{type:"enabled"},reasoning_effort:"low"});
    expect(buildChatCompletionRequest(messages,"openai","gpt-4").reasoning_effort).toBeUndefined();
  });

  test("disables V4 thinking by default for bounded product responses", () => {
    expect(buildChatCompletionRequest(messages, "deepseek", "deepseek-v4-flash")).toMatchObject({
      thinking: { type: "disabled" },
    });
  });

  test("supports explicit JSON output", () => {
    expect(buildChatCompletionRequest(messages, "deepseek", "deepseek-v4-flash", { responseFormat: "json_object" })).toMatchObject({
      response_format: { type: "json_object" },
    });
  });

  test("Kimi requests do not inherit incompatible fixed sampling or thinking fields",()=>{
    const request=buildChatCompletionRequest(messages,"tokendance","kimi-k3",{temperature:0.4});
    expect(request.temperature).toBeUndefined();expect(request.thinking).toBeUndefined();
  });

  test("reads TokenDance recovery actions from direct and wrapped SDK errors", () => {
    const headers = new Headers({ "TokenDance-Recovery-Action": "top_up_balance" });
    expect(tokenDanceRecoveryActionFromError({ headers })).toBe("top_up_balance");
    expect(tokenDanceRecoveryActionFromError({ cause: { headers: { "tokendance-recovery-action": "api_key_quota" } } })).toBe("api_key_quota");
    expect(tokenDanceRecoveryActionFromError({ headers: { "tokendance-recovery-action": "unknown" } })).toBeUndefined();
  });
});
