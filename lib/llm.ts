import OpenAI from "openai";
import { setTimeout as setTimeoutPromise } from "timers/promises";
import { getGenerationContext } from "./generation-context";
import { classifyGenerationFailure, estimateGenerationCost, normalizeGenerationUsage, recordGenerationEvent } from "./llm-telemetry";
import { getTokenPayCredential, tokenDanceAttributionHeaders, TokenPayError, type TokenPayRecoveryAction } from "./tokenpay";

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

export function tokenDanceRecoveryActionFromError(error: unknown): TokenPayRecoveryAction | undefined {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const cause = candidate.cause && typeof candidate.cause === "object" ? candidate.cause as Record<string, unknown> : {};
  const rawHeaders = candidate.headers || cause.headers;
  const headerRecord = rawHeaders && typeof rawHeaders === "object" ? rawHeaders as Record<string, unknown> : {};
  const rawAction = rawHeaders instanceof Headers
    ? rawHeaders.get("tokendance-recovery-action")
    : headerRecord["tokendance-recovery-action"] || headerRecord["TokenDance-Recovery-Action"];
  return typeof rawAction === "string" && ["top_up_balance", "reauthorize_api_key", "api_key_quota"].includes(rawAction)
    ? rawAction as TokenPayRecoveryAction
    : undefined;
}

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
async function callWithTimeoutAndRetry<T>(
  clientCallFn: () => Promise<T>,
  opts: { timeoutMs?: number; maxRetries?: number; onRetry?: (attempt: number) => void } = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 30000; // 默认 30 秒超时
  const maxRetries = opts.maxRetries ?? 2;

  let attempt = 0;
  let lastErr: unknown = null;

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
    } catch (e: unknown) {
      lastErr = e;
      const details = e && typeof e === "object" ? e as Record<string, unknown> : {};
      // if auth error or bad request, don't retry
      const msg = String(details.message || "");
      const errorCode = details.code || "";
      const statusCode = details.status || details.statusCode || "";
      const recoveryAction = tokenDanceRecoveryActionFromError(e);

      if (
        recoveryAction ||
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
        details.message || e
      );
      await setTimeoutPromise(backoff);
      continue;
    }
  }

  // all retries failed
  const lastDetails = lastErr && typeof lastErr === "object" ? lastErr as Record<string, unknown> : {};
  const err = new Error(`LLM API 调用失败: ${lastDetails.message === "LLM_REQUEST_TIMEOUT" ? "Request timed out." : lastDetails.message || "Unknown error"}`);
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
    defaultHeaders: provider === "tokendance" ? tokenDanceAttributionHeaders() : undefined,
    timeout: options?.timeout || 30000, // SDK 级别的超时（作为最后防线）
  });

  // wrapper to call SDK
  const clientCall = async () => {
    const completion = await client.chat.completions.create(
      buildChatCompletionRequest(messages, provider, model, options) as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
    );
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
  } catch (e: unknown) {
    const details = e && typeof e === "object" ? e as Record<string, unknown> : {};
    const cause = details.cause && typeof details.cause === "object" ? details.cause as Record<string, unknown> : {};
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
    console.error("LLM 调用失败：", details.message || e, details.cause || "");

    if (provider === "tokendance") {
      const recoveryAction = tokenDanceRecoveryActionFromError(e)
        || (details.status === 401 || cause.status === 401
          ? "reauthorize_api_key"
          : undefined);
      if (recoveryAction) {
        const message = recoveryAction === "top_up_balance"
          ? "TokenPay 余额不足，请充值后重试"
          : recoveryAction === "reauthorize_api_key"
            ? "TokenPay 授权已失效，请重新连接"
            : "TokenPay API Key 已达到周期额度，请稍后重试或重新授权";
        throw new TokenPayError(message, Number(details.status || cause.status || 402), recoveryAction);
      }
    }

    // 详细的错误处理
    if (details.code === "insufficient_quota") {
      throw new Error("API 配额不足，请检查账户余额");
    } else if (details.code === "invalid_api_key") {
      throw new Error("API Key 无效，请检查环境变量配置");
    } else if (String(details.message || "").includes("timeout") || details.message === "LLM_REQUEST_TIMEOUT") {
      throw new Error("LLM API 调用失败: Request timed out.");
    } else {
      throw new Error(`LLM API 调用失败: ${details.message || "未知错误"}`);
    }
  }
}
