import { buildChatCompletionRequest, tokenDanceRecoveryActionFromError } from "./llm";

describe("DeepSeek completion request", () => {
  const messages = [{ role: "user" as const, content: "return json" }];

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

  test("reads TokenDance recovery actions from direct and wrapped SDK errors", () => {
    const headers = new Headers({ "TokenDance-Recovery-Action": "top_up_balance" });
    expect(tokenDanceRecoveryActionFromError({ headers })).toBe("top_up_balance");
    expect(tokenDanceRecoveryActionFromError({ cause: { headers: { "tokendance-recovery-action": "api_key_quota" } } })).toBe("api_key_quota");
    expect(tokenDanceRecoveryActionFromError({ headers: { "tokendance-recovery-action": "unknown" } })).toBeUndefined();
  });
});
