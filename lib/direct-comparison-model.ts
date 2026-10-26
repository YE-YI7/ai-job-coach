import OpenAI from 'openai';
import {getTokenPayCredential, tokenDanceAttributionHeaders} from './tokenpay';
import {normalizeGenerationUsage, estimateGenerationCost, recordGenerationEvent} from './llm-telemetry';
/** One exact-model transport call. No résumé harness, retrieval, editorial planning, review, repair or fallback. */
export async function directComparisonModel(args: {
  userId: string; traceId: string; model: string;
  messages: Array<{role: 'system' | 'user'; content: string}>;
}) {
  const key = await getTokenPayCredential(args.userId);
  if (!key) throw Error('active_tokendance_connection_required');
  const start = Date.now();
  const client = new OpenAI({apiKey: key, baseURL: 'https://tokendance.space/gateway/v1',
    maxRetries: 0, timeout: 240000, defaultHeaders: tokenDanceAttributionHeaders()});
  try {
    const response = await client.chat.completions.create({model: args.model, messages: args.messages,
      temperature: 0.3, max_tokens: 6500, response_format: {type: 'json_object'},
      ...(/deepseek/i.test(args.model) ? {thinking: {type: 'disabled'}} : {}),
    });
    const usage = normalizeGenerationUsage(response.usage as unknown as Record<string, unknown>);
    const cost = estimateGenerationCost('tokendance', args.model, usage);
    await recordGenerationEvent({userId: args.userId, operation: 'admin_resume_direct_comparison', requestId: args.traceId,
      provider: 'tokendance', model: args.model, status: 'success', latencyMs: Date.now() - start,
      retryCount: 0, usage, ...cost});
    return {text: response.choices[0]?.message.content || '', finishReason: response.choices[0]?.finish_reason,
      reportedModel: response.model, usage: {provider: 'tokendance', model: args.model, inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens, cacheHitTokens: usage.cacheHitTokens, retryCount: 0, ...cost}};
  } catch (error) {
    await recordGenerationEvent({userId: args.userId, operation: 'admin_resume_direct_comparison', requestId: args.traceId,
      provider: 'tokendance', model: args.model, status: 'error', latencyMs: Date.now() - start, retryCount: 0,
      usage: normalizeGenerationUsage(null), estimatedCostUsd: null, pricingVersion: null});
    throw error;
  }
}
