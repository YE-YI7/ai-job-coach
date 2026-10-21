import { GET, POST } from './route';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDbClient } from '@/lib/db';
import { getTokenPayCredential } from '@/lib/tokenpay';
import { observedResumeLLM } from '@/lib/coach-harness/eval-observer';
jest.mock('@/lib/auth', () => ({ getCurrentUserFromRequest: jest.fn() }));
jest.mock('@/lib/db', () => ({ getDbClient: jest.fn() }));
jest.mock('@/lib/tokenpay', () => ({ getTokenPayCredential: jest.fn() }));
jest.mock('@/lib/coach-harness/eval-observer', () => ({
  withEvalObserver: (_: unknown, fn: () => unknown) => fn(), redactEval: (v: unknown) => v, observedResumeLLM: jest.fn(),
}));
const origin = 'https://example.com';
const make = (body: unknown = { kind: 'short', acknowledgeCost: true }, site = origin) => new Request(`${origin}/api/admin/resume-model-diagnostic`, { method: 'POST', headers: { origin: site }, body: JSON.stringify(body) });
const captured = [{ role: 'system', content: 'original mentor prompt' }, { role: 'user', content: JSON.stringify({ resume: 'original resume', conversation: [{ id: 'turn', user: '先讨论，不修改', tutor: null }] }) }];
let inserts: jest.Mock, updates: jest.Mock, tables: string[];
const priorAdmin = process.env.ADMIN_EMAILS;
beforeEach(() => {
  jest.clearAllMocks(); jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-21T00:00:00Z'));
  process.env.ADMIN_EMAILS = 'admin@example.invalid';
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: 'owner', email: 'admin@example.invalid' });
  (getTokenPayCredential as jest.Mock).mockResolvedValue('server-only-key');
  inserts = jest.fn().mockResolvedValue({ error: null }); updates = jest.fn(); tables = [];
  const chain = { eq: jest.fn().mockReturnThis(), maybeSingle: async () => ({ data: { run: { spans: [{ id: 'b0bb4f54-1bee-49ba-bc17-0d6694f4ee4e', input: { messages: captured }, knowledge: [] }] } }, error: null }), then: (fn: (v: unknown) => unknown) => fn({ error: null }) };
  (getDbClient as jest.Mock).mockResolvedValue({ from: (table: string) => { tables.push(table); return { select: () => chain, insert: inserts, update: (value: unknown) => { updates(value); return chain; } }; } });
  (observedResumeLLM as jest.Mock).mockResolvedValue('{"ok":true}');
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { if (priorAdmin === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = priorAdmin; });
test('anonymous/non-admin denied without touching model or DB', async () => {
  for (const user of [null, { id: 'other', email: 'other@example.invalid' }]) {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(user);
    expect([401,403]).toContain((await POST(make())).status);
    expect([401,403]).toContain((await GET()).status);
  }
  expect(getDbClient).not.toHaveBeenCalled(); expect(observedResumeLLM).not.toHaveBeenCalled();
});
test('CSRF, cost refusal, injected model and expired window cannot spend tokens', async () => {
  expect((await POST(make(undefined, 'https://evil.invalid'))).status).toBe(403);
  expect((await POST(make({ kind: 'short', acknowledgeCost: false }))).status).toBe(400);
  expect((await POST(make({ kind: 'short', acknowledgeCost: true, model: 'expensive' }))).status).toBe(400);
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-23T00:00:00Z'));
  expect((await POST(make())).status).toBe(410);
  expect(observedResumeLLM).not.toHaveBeenCalled();
});
test('duplicate/concurrent requests share deterministic ID and never retry billing', async () => {
  await POST(make()); const id = inserts.mock.calls[0][0].id;
  inserts.mockResolvedValue({ error: { code: '23505' } });
  expect((await POST(make())).status).toBe(202);
  expect(inserts.mock.calls[1][0].id).toBe(id);
  expect(observedResumeLLM).toHaveBeenCalledTimes(1);
});
test('lost connection does not silently charge site model; storage failure makes no call', async () => {
  (getTokenPayCredential as jest.Mock).mockResolvedValue(null);
  expect((await POST(make())).status).toBe(409);
  (getTokenPayCredential as jest.Mock).mockResolvedValue('server-only');
  inserts.mockResolvedValue({ error: { code: 'unavailable' } });
  expect((await POST(make())).status).toBe(503);
  expect(observedResumeLLM).not.toHaveBeenCalled();
});
test('mentor uses original captured input, validates decision but never invokes editor or business writes', async () => {
  (observedResumeLLM as jest.Mock).mockResolvedValue('{"action":"discuss","reply":"我们先讨论亮点。","editorBrief":"","supplement":null}');
  const result = await (await POST(make({ kind: 'mentor', acknowledgeCost: true }))).json();
  expect(result).toMatchObject({ ok: true, decision: 'discuss' });
  expect(observedResumeLLM).toHaveBeenCalledWith(captured, expect.objectContaining({ onDelta: expect.any(Function), maxRetries: 0, timeoutMs: 45000 }));
  expect(new Set(tables)).toEqual(new Set(['coach_eval_runs']));
  expect(updates.mock.calls.at(-1)?.[0].run.result.editorExecuted).toBe(false);
});
test('upstream failure is saved, not retried or written into original trace', async () => {
  (observedResumeLLM as jest.Mock).mockRejectedValue(Error('Request timed out.'));
  const result = await (await POST(make())).json();
  expect(result).toMatchObject({ ok: false, status: 'failed' });
  expect(observedResumeLLM).toHaveBeenCalledTimes(1);
  expect(updates.mock.calls.at(-1)?.[0].run.input.sourceTraceId).toBe('35d45ca9-1737-4d9d-8f5d-8cfb7a41a631');
});
test('another admin cannot use the original owner trace', async () => {
  const chain = { eq: jest.fn().mockReturnThis(), maybeSingle: async () => ({ data: null, error: null }) };
  (getDbClient as jest.Mock).mockResolvedValue({ from: () => ({ select: () => chain }) });
  expect((await POST(make())).status).toBe(403);
  expect(getTokenPayCredential).not.toHaveBeenCalled(); expect(observedResumeLLM).not.toHaveBeenCalled();
});
test('even a valid revise decision is only inspected, never executed', async () => {
  (observedResumeLLM as jest.Mock).mockResolvedValue('{"action":"revise","reply":"准备精简实习描述。","editorBrief":"只精简实习描述","supplement":null}');
  const result = await (await POST(make({ kind:'mentor', acknowledgeCost:true }))).json();
  expect(result.decision).toBe('revise');
  expect(updates.mock.calls.at(-1)?.[0].run.result.editorExecuted).toBe(false);
  expect(new Set(tables)).toEqual(new Set(['coach_eval_runs']));
});
