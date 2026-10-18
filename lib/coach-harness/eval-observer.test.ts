import {
  withEvalObserver,
  observedResumeLLM,
  redactEval,
  type EvalSpan,
} from "./eval-observer";
import { callLLM } from "@/lib/llm";
import { runWithGenerationContext } from "@/lib/generation-context";
jest.mock("@/lib/llm", () => ({ callLLM: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
test("normal-user path preserves original arguments and captures nothing", async () => {
  (callLLM as jest.Mock).mockResolvedValue("ok");
  const messages = [{ role: "user" as const, content: "sample" }];
  expect(await observedResumeLLM(messages, { maxTokens: 20 })).toBe("ok");
  expect(callLLM).toHaveBeenCalledWith(messages, { maxTokens: 20 });
});
test("admin eval observes actual visible input/output, model and knowledge IDs", async () => {
  (callLLM as jest.Mock).mockImplementation(async (_messages, options) => {
    options.onUsage({ model: "actual-test-model" });
    return '{"changes":[]}';
  });
  const spans: EvalSpan[] = [],
    save = jest.fn().mockResolvedValue(undefined);
  await withEvalObserver({ spans, save }, () =>
    runWithGenerationContext(
      { operation: "resume_draft", knowledgeDocumentIds: ["method-1"] },
      () => observedResumeLLM([{ role: "user", content: "sample" }]),
    ),
  );
  expect(spans).toHaveLength(1);
  expect(spans[0]).toMatchObject({
    agent: "改稿 Agent",
    status: "completed",
    model: "actual-test-model",
    output: '{"changes":[]}',
  });
  expect(spans[0].knowledge[0].id).toBe("method-1");
  expect(save).toHaveBeenCalledTimes(2);
});
test("concurrent eval scopes cannot mix prompts or results", async () => {
  (callLLM as jest.Mock).mockImplementation(async (messages) => {
    await Promise.resolve();
    return messages[0].content;
  });
  const a: EvalSpan[] = [],
    b: EvalSpan[] = [];
  await Promise.all([
    withEvalObserver({ spans: a, save: async () => {} }, () =>
      observedResumeLLM([{ role: "user", content: "A" }]),
    ),
    withEvalObserver({ spans: b, save: async () => {} }, () =>
      observedResumeLLM([{ role: "user", content: "B" }]),
    ),
  ]);
  expect(a.map((s) => s.output)).toEqual(["A"]);
  expect(b.map((s) => s.output)).toEqual(["B"]);
});
test("model failures remain visible and propagate, credentials are redacted", async () => {
  (callLLM as jest.Mock).mockRejectedValue(new Error("provider failed"));
  const spans: EvalSpan[] = [];
  await expect(
    withEvalObserver({ spans, save: async () => {} }, () =>
      observedResumeLLM([{ role: "user", content: "sample" }]),
    ),
  ).rejects.toThrow("provider failed");
  expect(spans[0].status).toBe("failed");
  expect(
    redactEval({ apiKey: "private", messages: ["Bearer abcdefghijk"] }),
  ).toEqual({ apiKey: "[已屏蔽凭据]", messages: ["Bearer [已屏蔽]"] });
});
