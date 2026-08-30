import { buildChatCompletionRequest } from "./llm";

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
});
