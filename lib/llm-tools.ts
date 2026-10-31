/** Opt-in native tool transport. Ordinary text/streaming callers keep their existing contract. */
export type NativeTool = {
  type: 'function';
  function: {name: string; description: string; parameters: Record<string, unknown>};
};
export type NativeToolCall = {
  id: string; type: 'function'; function: {name: string; arguments: string};
};
export type LlmMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: NativeToolCall[];
};

/** Preserve exact upstream calls, including IDs/arguments; never fabricate a tool request from prose. */
export function nativeToolEnvelope(
  message: {content?: string | null; tool_calls?: unknown[]} | undefined,
  finishReason: string | null | undefined,
  tools: NativeTool[],
) {
  if (finishReason !== 'tool_calls' || !message?.tool_calls?.length) throw Error('NATIVE_TOOL_RESPONSE_REQUIRED');
  if (message.tool_calls.length > 12) throw Error('NATIVE_TOOL_CALL_LIMIT');
  const allowed = new Set(tools.map(t => t.function.name)), ids = new Set<string>();
  const calls = message.tool_calls as NativeToolCall[];
  for (const call of calls) {
    if (!call || call.type !== 'function' || typeof call.id !== 'string' || !call.id || ids.has(call.id)
      || !allowed.has(call.function?.name) || typeof call.function.arguments !== 'string') {
      throw Error('NATIVE_TOOL_RESPONSE_INVALID');
    }
    ids.add(call.id);
    const args: unknown = JSON.parse(call.function.arguments);
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('NATIVE_TOOL_ARGUMENTS_INVALID');
  }
  return JSON.stringify({type: 'native_tool_calls', content: message.content || '', tool_calls: calls});
}
