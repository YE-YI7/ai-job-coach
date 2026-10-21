/** Safe transport evidence, captured before the SDK discards native fetch causes.
 * Never includes URLs, headers, prompts, credentials or raw error messages. */
export interface LlmTransportDiagnostic {
  provider: string;
  model: string;
  stream: boolean;
  timeoutMs: number;
  firstTokenTimeoutMs: number | null;
  attempts: number;
  headersMs?: number;
  firstActivityMs?: number;
  firstContentMs?: number;
  httpStatus?: number;
  nativeErrorCodes?: string[];
  phase: 'connecting' | 'awaiting_output' | 'receiving_output' | 'completed';
  deadline?: 'total' | 'first_activity';
  outcome?: 'success' | 'failed';
  elapsedMs?: number;
}

export function nativeTransportCodes(error: unknown): string[] {
  const codes: string[] = [];
  let value = error;
  for (let depth = 0; depth < 5 && value && typeof value === 'object'; depth++) {
    const item = value as { code?: unknown; cause?: unknown };
    if (typeof item.code === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(item.code)) codes.push(item.code);
    value = item.cause;
  }
  return [...new Set(codes)];
}

export function diagnosticFetch(diagnostic: LlmTransportDiagnostic, startedAt: number, upstream: typeof fetch = globalThis.fetch): typeof fetch {
  return async (input, init) => {
    diagnostic.attempts++;
    diagnostic.phase = 'connecting';
    try {
      const response = await upstream(input, init);
      diagnostic.headersMs = Date.now() - startedAt;
      diagnostic.httpStatus = response.status;
      diagnostic.phase = 'awaiting_output';
      return response;
    } catch (error) {
      diagnostic.nativeErrorCodes = nativeTransportCodes(error);
      throw error;
    }
  };
}
