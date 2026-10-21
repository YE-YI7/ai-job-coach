import { diagnosticFetch, nativeTransportCodes, type LlmTransportDiagnostic } from './llm-transport';
const base = (): LlmTransportDiagnostic => ({ provider: 'tokendance', model: 'deepseek-v4-flash', stream: true, timeoutMs: 45000, firstTokenTimeoutMs: 30000, attempts: 0, phase: 'connecting' });
test('captures native connection timeout before SDK replaces it; never headers/body/error strings', async () => {
  const diagnostic = base();
  const error = Object.assign(new TypeError('fetch failed Bearer private'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT', message: 'private' } });
  const upstream = jest.fn().mockRejectedValue(error);
  await expect(diagnosticFetch(diagnostic, Date.now(), upstream)('https://example.invalid', { headers: { authorization: 'Bearer private' } })).rejects.toBe(error);
  expect(diagnostic).toMatchObject({ attempts: 1, phase: 'connecting', nativeErrorCodes: ['UND_ERR_CONNECT_TIMEOUT'] });
  expect(JSON.stringify(diagnostic)).not.toMatch(/private|Bearer|https/);
  expect(upstream).toHaveBeenCalledTimes(1);
});
test('records upstream HTTP response without consuming or changing the stream', async () => {
  const diagnostic = base(), response = new Response('body', { status: 200 });
  const result = await diagnosticFetch(diagnostic, Date.now(), jest.fn().mockResolvedValue(response))('https://example.invalid');
  expect(result).toBe(response);
  expect(result.bodyUsed).toBe(false);
  expect(diagnostic).toMatchObject({ attempts: 1, phase: 'awaiting_output', httpStatus: 200 });
});
test('bounds recursive causes and rejects arbitrary secret-bearing codes', () => {
  const cycle: { code: string; cause?: unknown } = { code: 'ETIMEDOUT' }; cycle.cause = cycle;
  expect(nativeTransportCodes(cycle)).toEqual(['ETIMEDOUT']);
  expect(nativeTransportCodes({ code: 'sk-private-credential' })).toEqual([]);
});
