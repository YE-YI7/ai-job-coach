import OpenAI from "openai";
import { setTimeout as setTimeoutPromise } from "timers/promises";
import { getGenerationContext } from "./generation-context";
import { classifyGenerationFailure, estimateGenerationCost, normalizeGenerationUsage, recordGenerationEvent } from "./llm-telemetry";
import { getTokenPayCredential, TOKENPAY_APP_URL, TokenPayError, type TokenPayRecoveryAction } from "./tokenpay";

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

type LlmOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  provider?: "deepseek" | "openai" | "tokendance";
  timeout?: number;
  timeoutMs?: number;
  maxRetries?: number;
  thinking?: "enabled" | "disabled";
  responseFormat?: "json_object";
};

export function buildChatCompletionRequest(messages: Message[], provider: "deepseek" | "openai" | "tokendance", model: string, options?: LlmOptions) {
  const request: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2000,
  };
  // DeepSeek V4 enables thinking by default. Most product endpoints expect a
  // bounded final answer; with their existing token limits, reasoning alone
  // can exhaust max_tokens and leave message.content empty.
  if (provider === "deepseek" || (provider === "tokendance" && model.toLowerCase().includes("deepseek"))) {
    request.thinking = { type: options?.thinking || "disabled" };
  }
  if (options?.responseFormat) request.response_format = { type: options.responseFormat };
  return request;
}

/**
 * 带超时和重试的 LLM 调用包装器
 */
async function callWithTimeoutAndRetry(
  clientCallFn: () => Promise<any>,
  opts: { timeoutMs?: number; maxRetries?: number; onRetry?: (attempt: number) => void } = {}
) {
  const timeoutMs = opts.timeoutMs ?? 30000; // 默认 30 秒超时
  const maxRetries = opts.maxRetries ?? 2;

  let attempt = 0;
  let lastErr: any = null;

  while (attempt <= maxRetries) {
    try {
      // Promise.race -> timeout
      const p = clientCallFn();
      const res = await Promise.race([
        p,
        (async () => {
          await setTimeoutPromise(timeoutMs);
          throw new Error("LLM_REQUEST_TIMEOUT");
        })(),
      ]);
      return res;
    } catch (e: any) {
      lastErr = e;
      // if auth error or bad request, don't retry
      const msg = String(e?.message || "");
      const errorCode = e?.code || "";
      const statusCode = e?.status || e?.statusCode || "";

      if (
        msg.includes("Authentication") ||
        msg.includes("401") ||
        msg.includes("Invalid") ||
        msg.includes("400") ||
        errorCode === "invalid_api_key" ||
        errorCode === "insufficient_quota" ||
        statusCode === 401 ||
        statusCode === 400
      ) {
        throw e;
      }

      // retry for timeouts / network errors
      attempt++;
      if (attempt > maxRetries) break;
      opts.onRetry?.(attempt);
      const backoff = 500 * attempt; // 500ms, 1000ms...
      console.warn(
        `LLM request failed, retry ${attempt}/${maxRetries}, backoff ${backoff}ms`,
        e?.message || e
      );
      await setTimeoutPromise(backoff);
      continue;
    }
  }

  // all retries failed
  const err = new Error(
    `LLM API 调用失败: ${lastErr?.message === "LLM_REQUEST_TIMEOUT" ? "Request timed out." : lastErr?.message || "Unknown error"}`
  );
  err.cause = lastErr;
  throw err;
}

/**
 * 调用 LLM API（支持 DeepSeek 和 OpenAI）
 * @param messages 消息数组
 * @param options 可选配置
 * @returns AI 回复文本
 */
export async function callLLM(
  messages: Message[],
  options?: LlmOptions
): Promise<string> {
  // quick validation
  if (!Array.isArray(messages)) {
    throw new Error("Invalid messages");
  }

  const trace = getGenerationContext();
  let provider: "deepseek" | "openai" | "tokendance" = options?.provider || "deepseek";
  let apiKey: string | undefined;
  // A connected TokenPay account becomes the user's model provider for every
  // metered AI action carrying a generation context. Unconnected users keep
  // the hosted provider and existing product quota behavior.
  if (provider === "deepseek" && trace?.userId) {
    const tokenPayKey = await getTokenPayCredential(trace.userId);
    if (tokenPayKey) {
      provider = "tokendance";
      apiKey = tokenPayKey;
    }
  }
  const model = options?.model || (provider === "openai" ? "gpt-3.5-turbo" : "deepseek-v4-flash");
  const startedAt = Date.now();
  let retryCount = 0;

  // ========== STUB 模式检查（最高优先级，在 apiKey 校验之前）==========
  // stub only if env explicitly enabled
  const useStub = process.env.LLM_STUB === "1";
  if (useStub) {
    console.warn("Using LLM stub mode (LLM_STUB=1)");
    await recordGenerationEvent({
      userId: trace?.userId,
      operation: trace?.operation || "unclassified",
      requestId: trace?.requestId,
      provider,
      model,
      status: "stub",
      latencyMs: Date.now() - startedAt,
      retryCount: 0,
      usage: normalizeGenerationUsage(null),
      estimatedCostUsd: 0,
      pricingVersion: null,
      knowledgeDocumentIds: trace?.knowledgeDocumentIds,
    }).catch((error) => console.warn("LLM telemetry write failed:", error));
    // 直接返回 mock 响应，不走真实 deepseek 请求，不触发 timeout 逻辑
    return "Hello! 👋 How can I help you today?";
  }

  apiKey ??= provider === "deepseek"
    ? process.env.DEEPSEEK_API_KEY
    : provider === "openai"
      ? process.env.OPENAI_API_KEY
      : undefined;

  if (!apiKey) {
    const error = new Error(`${provider.toUpperCase()}_API_KEY not found in environment variables`);
    await recordGenerationEvent({
      userId: trace?.userId,
      operation: trace?.operation || "unclassified",
      requestId: trace?.requestId,
      provider,
      model,
      status: "error",
      latencyMs: Date.now() - startedAt,
      retryCount: 0,
      usage: normalizeGenerationUsage(null),
      estimatedCostUsd: null,
      pricingVersion: null,
      failureType: "configuration",
      knowledgeDocumentIds: trace?.knowledgeDocumentIds,
    }).catch((telemetryError) => console.warn("LLM telemetry write failed:", telemetryError));
    throw error;
  }

  const client = new OpenAI({
    apiKey,
    baseURL: provider === "deepseek"
      ? "https://api.deepseek.com"
      : provider === "tokendance"
        ? "https://tokendance.space/gateway/v1"
        : undefined, // OpenAI 使用默认 baseURL
    defaultHeaders: provider === "tokendance" ? { "X-App-URL": TOKENPAY_APP_URL } : undefined,
    timeout: options?.timeout || 30000, // SDK 级别的超时（作为最后防线）
  });

  // wrapper to call SDK
  const clientCall = async () => {
    const completion = await client.chat.completions.create(buildChatCompletionRequest(messages, provider, model, options) as any);
    if (!completion.choices[0]?.message?.content) {
      const finishReason = completion.choices[0]?.finish_reason || "unknown";
      throw new Error(`Empty response from LLM (finish_reason=${finishReason})`);
    }
    return completion;
  };

  // call with timeout & retry
  try {
    const completion = await callWithTimeoutAndRetry(clientCall, {
      timeoutMs: options?.timeoutMs ?? options?.timeout ?? 60000, // 增加到60秒
      maxRetries: options?.maxRetries ?? 2,
      onRetry: () => { retryCount += 1; },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from LLM");

    const usage = normalizeGenerationUsage(completion.usage as Record<string, unknown> | undefined);
    const cost = estimateGenerationCost(provider, model, usage);
    await recordGenerationEvent({
      userId: trace?.userId,
      operation: trace?.operation || "unclassified",
      requestId: trace?.requestId,
      provider,
      model,
      status: "success",
      latencyMs: Date.now() - startedAt,
      retryCount,
      usage,
      estimatedCostUsd: cost.estimatedCostUsd,
      pricingVersion: cost.pricingVersion,
      knowledgeDocumentIds: trace?.knowledgeDocumentIds,
    }).catch((error) => console.warn("LLM telemetry write failed:", error));

    return content;
  } catch (e: any) {
    await recordGenerationEvent({
      userId: trace?.userId,
      operation: trace?.operation || "unclassified",
      requestId: trace?.requestId,
      provider,
      model,
      status: "error",
      latencyMs: Date.now() - startedAt,
      retryCount,
      usage: normalizeGenerationUsage(null),
      estimatedCostUsd: null,
      pricingVersion: null,
      failureType: classifyGenerationFailure(e),
      knowledgeDocumentIds: trace?.knowledgeDocumentIds,
    }).catch((error) => console.warn("LLM telemetry write failed:", error));
    console.error("LLM 调用失败：", e?.message || e, e?.cause || "");

    if (provider === "tokendance") {
      const rawHeaders = e?.headers;
      const rawAction = typeof rawHeaders?.get === "function"
        ? rawHeaders.get("tokendance-recovery-action")
        : rawHeaders?.["tokendance-recovery-action"];
      const recoveryAction: TokenPayRecoveryAction | undefined = typeof rawAction === "string" && ["top_up_balance", "reauthorize_api_key", "api_key_quota"].includes(rawAction)
        ? rawAction as TokenPayRecoveryAction
        : e?.status === 401
          ? "reauthorize_api_key"
          : undefined;
      if (recoveryAction) {
        const message = recoveryAction === "top_up_balance"
          ? "TokenPay 余额不足，请充值后重试"
          : recoveryAction === "reauthorize_api_key"
            ? "TokenPay 授权已失效，请重新连接"
            : "TokenPay API Key 已达到周期额度，请稍后重试或重新授权";
        throw new TokenPayError(message, Number(e?.status || 402), recoveryAction);
      }
    }

    // 详细的错误处理
    if (e.code === "insufficient_quota") {
      throw new Error("API 配额不足，请检查账户余额");
    } else if (e.code === "invalid_api_key") {
      throw new Error("API Key 无效，请检查环境变量配置");
    } else if (e.message?.includes("timeout") || e.message === "LLM_REQUEST_TIMEOUT") {
      throw new Error("LLM API 调用失败: Request timed out.");
    } else {
      throw new Error(`LLM API 调用失败: ${e.message || "未知错误"}`);
    }
  }
}
