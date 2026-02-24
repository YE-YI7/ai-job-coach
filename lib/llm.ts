import OpenAI from "openai";
import { setTimeout as setTimeoutPromise } from "timers/promises";

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * 带超时和重试的 LLM 调用包装器
 */
async function callWithTimeoutAndRetry(
  clientCallFn: () => Promise<any>,
  opts: { timeoutMs?: number; maxRetries?: number } = {}
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
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    provider?: "deepseek" | "openai";
    timeout?: number;
    timeoutMs?: number;
    maxRetries?: number;
  }
): Promise<string> {
  // quick validation
  if (!Array.isArray(messages)) {
    throw new Error("Invalid messages");
  }

  // ========== STUB 模式检查（最高优先级，在 apiKey 校验之前）==========
  // stub only if env explicitly enabled
  const useStub = process.env.LLM_STUB === "1";
  if (useStub) {
    console.warn("Using LLM stub mode (LLM_STUB=1)");
    // 直接返回 mock 响应，不走真实 deepseek 请求，不触发 timeout 逻辑
    return "Hello! 👋 How can I help you today?";
  }

  const provider = options?.provider || "deepseek";
  const apiKey = provider === "deepseek" 
    ? process.env.DEEPSEEK_API_KEY 
    : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(`${provider.toUpperCase()}_API_KEY not found in environment variables`);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: provider === "deepseek" 
      ? "https://api.deepseek.com" 
      : undefined, // OpenAI 使用默认 baseURL
    timeout: options?.timeout || 30000, // SDK 级别的超时（作为最后防线）
  });

  // wrapper to call SDK
  const clientCall = async () => {
    return await client.chat.completions.create({
      model: options?.model || (provider === "deepseek" ? "deepseek-chat" : "gpt-3.5-turbo"),
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2000, // 增加到 2000，支持更长的回复
    });
  };

  // call with timeout & retry
  try {
    const completion = await callWithTimeoutAndRetry(clientCall, {
      timeoutMs: options?.timeoutMs ?? options?.timeout ?? 60000, // 增加到60秒
      maxRetries: options?.maxRetries ?? 2,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from LLM");
    }

    return content;
  } catch (e: any) {
    console.error("LLM 调用失败：", e?.message || e, e?.cause || "");

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

