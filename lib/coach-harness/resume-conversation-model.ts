import type { callLLM } from '@/lib/llm';

/** Receive the upstream stream so a gateway needn't buffer the complete JSON.
 * This is internal transport, not partial UI output: parse/commit only after the
 * full stream finishes. No auto-retry or provider swap (potential double billing).
 */
export function resumeConversationLlmOptions(): NonNullable<Parameters<typeof callLLM>[1]> {
  return { provider:'deepseek', temperature:0, maxTokens:1400, reasoningBudgetTokens:2048,
    timeoutMs:45_000, firstTokenTimeoutMs:30_000, maxRetries:0,
    responseFormat:'json_object', onDelta:()=>undefined };
}
