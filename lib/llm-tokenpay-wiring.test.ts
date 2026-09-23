/**
 * 答题链路·callLLM 接线回归：已连接 TokenPay 的账号在带生成上下文的调用
 * （模拟面试出题/答题评估都经 runWithGenerationContext）必须翻到网关、
 * 并落到 resolveTokenDanceModel 解析出的模型上；解析层的显式报错必须原样
 * 透出（不重试、不换模型、不静默降级）；400 不做无意义重试；余额类错误
 * 转成 TokenPayError 让 UI 给恢复动作。
 */

jest.mock("openai", () => {
  const create = jest.fn();
  (globalThis as Record<string, unknown>).__openaiCreate = create;
  class FakeOpenAI {
    options: unknown;
    chat = { completions: { create: (...args: unknown[]) => create(...args) } };
    constructor(options: unknown) {
      this.options = options;
    }
  }
  return { __esModule: true, default: FakeOpenAI };
});

jest.mock("./generation-context", () => ({ getGenerationContext: jest.fn() }));
jest.mock("./tokenpay", () => {
  class TokenPayError extends Error {
    status: number;
    recoveryAction: string;
    constructor(message: string, status: number, recoveryAction: string) {
      super(message);
      this.name = "TokenPayError";
      this.status = status;
      this.recoveryAction = recoveryAction;
    }
  }
  return {
    getTokenPayCredential: jest.fn(),
    tokenDanceAttributionHeaders: () => ({ "x-client": "test" }),
    TokenPayError,
  };
});
jest.mock("./coach-harness/chat-models", () => ({ resolveTokenDanceModel: jest.fn() }));
jest.mock("./llm-telemetry", () => ({
  recordGenerationEvent: jest.fn().mockResolvedValue(undefined),
  normalizeGenerationUsage: (usage: Record<string, unknown> | null | undefined) => ({
    inputTokens: Number(usage?.prompt_tokens ?? 0),
    outputTokens: Number(usage?.completion_tokens ?? 0),
    totalTokens: Number(usage?.total_tokens ?? 0),
    cacheHitTokens: 0,
    cacheMissTokens: 0,
  }),
  estimateGenerationCost: () => ({ estimatedCostUsd: 0, pricingVersion: null }),
  classifyGenerationFailure: () => "unknown",
}));

import { callLLM } from "./llm";
import { getGenerationContext } from "./generation-context";
import { getTokenPayCredential } from "./tokenpay";
import { resolveTokenDanceModel } from "./coach-harness/chat-models";

const create = (globalThis as Record<string, unknown>).__openaiCreate as jest.Mock;
const messages = [{ role: "user" as const, content: "评估这个回答" }];

function completion(text: string) {
  return { choices: [{ message: { content: text }, finish_reason: "stop" }], usage: null, model: "m" };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.LLM_STUB;
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  (resolveTokenDanceModel as jest.Mock).mockImplementation((_u: string, model: string) => Promise.resolve(model));
});

describe("callLLM 的 TokenPay 网关接线", () => {
  test("已连接账号 + 生成上下文：翻到网关，并打到解析后的模型", async () => {
    (getGenerationContext as jest.Mock).mockReturnValue({ userId: "u-1", operation: "mock_interview_answer_assessment" });
    (getTokenPayCredential as jest.Mock).mockResolvedValue("tp-key");
    (resolveTokenDanceModel as jest.Mock).mockResolvedValue("deepseek-v4-flash-0731");
    create.mockResolvedValue(completion("ok"));

    await callLLM(messages, { timeoutMs: 100, model: "deepseek-chat" });

    expect(resolveTokenDanceModel).toHaveBeenCalledWith("u-1", "deepseek-chat");
    const [request] = create.mock.calls[0];
    expect(request.model).toBe("deepseek-v4-flash-0731");
  });

  test("未连接账号：保持托管 DeepSeek，不触发网关解析", async () => {
    (getGenerationContext as jest.Mock).mockReturnValue({ userId: "u-1", operation: "x" });
    (getTokenPayCredential as jest.Mock).mockResolvedValue(null);
    create.mockResolvedValue(completion("ok"));

    await callLLM(messages, { timeoutMs: 100, model: "deepseek-chat" });

    expect(resolveTokenDanceModel).not.toHaveBeenCalled();
    const [request] = create.mock.calls[0];
    expect(request.model).toBe("deepseek-chat");
  });

  test("无生成上下文（公开工具）：不改 provider，也不查凭据", async () => {
    (getGenerationContext as jest.Mock).mockReturnValue(undefined);
    create.mockResolvedValue(completion("ok"));

    await callLLM(messages, { timeoutMs: 100, model: "deepseek-chat" });

    expect(getTokenPayCredential).not.toHaveBeenCalled();
    expect(resolveTokenDanceModel).not.toHaveBeenCalled();
  });

  test("解析层显式报错：原样透出，绝不打到网关（不换模型计费）", async () => {
    (getGenerationContext as jest.Mock).mockReturnValue({ userId: "u-1", operation: "x" });
    (getTokenPayCredential as jest.Mock).mockResolvedValue("tp-key");
    (resolveTokenDanceModel as jest.Mock).mockRejectedValue(
      new Error("TokenPay 模型「glm-5.3」当前不可用，未替换模型。请选择其他模型后重试。")
    );

    await expect(callLLM(messages, { timeoutMs: 100, model: "glm-5.3" })).rejects.toThrow("未替换模型");
    expect(create).not.toHaveBeenCalled();
  });

  test("网关 400（模型不存在）：不重试、透出具名错误", async () => {
    (getGenerationContext as jest.Mock).mockReturnValue({ userId: "u-1", operation: "x" });
    (getTokenPayCredential as jest.Mock).mockResolvedValue("tp-key");
    create.mockRejectedValue(Object.assign(new Error("400 模型不存在"), { status: 400 }));

    await expect(callLLM(messages, { timeoutMs: 100, model: "deepseek-chat" })).rejects.toThrow("LLM API 调用失败");
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("余额不足恢复头：转 TokenPayError，文案给出充值指引", async () => {
    (getGenerationContext as jest.Mock).mockReturnValue({ userId: "u-1", operation: "x" });
    (getTokenPayCredential as jest.Mock).mockResolvedValue("tp-key");
    create.mockRejectedValue({
      message: "payment required",
      status: 402,
      headers: { "tokendance-recovery-action": "top_up_balance" },
    });

    await expect(callLLM(messages, { timeoutMs: 100, model: "deepseek-chat" })).rejects.toMatchObject({
      name: "TokenPayError",
      message: "TokenPay 余额不足，请充值后重试",
      recoveryAction: "top_up_balance",
    });
  });
});
