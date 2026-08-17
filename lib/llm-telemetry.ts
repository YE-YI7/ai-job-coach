import { getDbClient } from "./db";

export interface GenerationUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
}

export interface GenerationEvent {
  userId?: string;
  operation: string;
  requestId?: string;
  provider: string;
  model: string;
  status: "success" | "error" | "stub";
  latencyMs: number;
  retryCount: number;
  usage: GenerationUsage;
  estimatedCostUsd: number | null;
  pricingVersion: string | null;
  failureType?: string;
  knowledgeDocumentIds?: string[];
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function normalizeGenerationUsage(raw: Record<string, unknown> | null | undefined): GenerationUsage {
  const inputTokens = numberValue(raw?.prompt_tokens ?? raw?.input_tokens);
  const outputTokens = numberValue(raw?.completion_tokens ?? raw?.output_tokens);
  const cacheHitTokens = numberValue(raw?.prompt_cache_hit_tokens ?? raw?.cache_read_input_tokens);
  const explicitMiss = numberValue(raw?.prompt_cache_miss_tokens);
  const cacheMissTokens = explicitMiss || Math.max(0, inputTokens - cacheHitTokens);
  const totalTokens = numberValue(raw?.total_tokens) || inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens, cacheHitTokens, cacheMissTokens };
}

export function estimateGenerationCost(provider: string, model: string, usage: GenerationUsage) {
  if (provider !== "deepseek") return { estimatedCostUsd: null, pricingVersion: null };
  const normalizedModel = model.toLowerCase();
  const isPro = normalizedModel.includes("v4-pro") || normalizedModel.includes("reasoner");
  const isFlash = normalizedModel.includes("v4-flash") || normalizedModel.includes("chat");
  if (!isPro && !isFlash) return { estimatedCostUsd: null, pricingVersion: null };

  const rates = isPro
    ? { cacheHit: 0.003625, cacheMiss: 0.435, output: 0.87 }
    : { cacheHit: 0.0028, cacheMiss: 0.14, output: 0.28 };
  const estimatedCostUsd = (
    usage.cacheHitTokens * rates.cacheHit
    + usage.cacheMissTokens * rates.cacheMiss
    + usage.outputTokens * rates.output
  ) / 1_000_000;
  return { estimatedCostUsd, pricingVersion: "deepseek-v4-2026-08-18" };
}

export function classifyGenerationFailure(error: unknown) {
  const value = error as { code?: unknown; status?: unknown; statusCode?: unknown; message?: unknown };
  const message = String(value?.message || "").toLowerCase();
  const code = String(value?.code || "").toLowerCase();
  const status = Number(value?.status || value?.statusCode || 0);
  if (message.includes("timeout")) return "timeout";
  if (status === 429 || code.includes("rate_limit")) return "rate_limit";
  if (status === 401 || code.includes("api_key") || message.includes("authentication")) return "authentication";
  if (status === 402 || code.includes("quota") || message.includes("balance")) return "provider_quota";
  if (message.includes("empty response")) return "empty_response";
  if (status >= 500) return "provider_error";
  if (status === 400 || status === 422 || message.includes("invalid")) return "invalid_request";
  return "unknown";
}

export async function recordGenerationEvent(event: GenerationEvent) {
  const client = await getDbClient();
  if (!client) return;
  const { error } = await client.from("ai_generation_events").insert({
    user_id: event.userId || null,
    operation: event.operation,
    request_id: event.requestId || null,
    provider: event.provider,
    model: event.model,
    status: event.status,
    latency_ms: Math.max(0, Math.round(event.latencyMs)),
    retry_count: Math.max(0, Math.round(event.retryCount)),
    input_tokens: event.usage.inputTokens,
    output_tokens: event.usage.outputTokens,
    total_tokens: event.usage.totalTokens,
    cache_hit_tokens: event.usage.cacheHitTokens,
    cache_miss_tokens: event.usage.cacheMissTokens,
    estimated_cost_usd: event.estimatedCostUsd,
    pricing_version: event.pricingVersion,
    failure_type: event.failureType || null,
    knowledge_document_ids: [...new Set(event.knowledgeDocumentIds || [])].slice(0, 12),
  });
  if (error) throw error;
}
