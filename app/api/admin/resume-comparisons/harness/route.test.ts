import {POST} from './route';
import {getCurrentUserFromRequest} from '@/lib/auth';
import {getDbClient} from '@/lib/db';
import {getTokenPayCredential} from '@/lib/tokenpay';
import {callLLM} from '@/lib/llm';
import {evidenceSource, runEvidenceComparison, EVIDENCE_SOURCE_TRACE} from '@/lib/coach-harness/resume-evidence-runtime';
import {CURRENT_EVIDENCE_REQUEST} from '@/lib/coach-harness/resume-evidence-contract';
import {createHash} from 'node:crypto';
jest.mock('@/lib/auth', () => ({getCurrentUserFromRequest: jest.fn()}));
jest.mock('@/lib/db', () => ({getDbClient: jest.fn()}));
jest.mock('@/lib/tokenpay', () => ({getTokenPayCredential: jest.fn()}));
jest.mock('@/lib/llm', () => ({callLLM: jest.fn()}));
jest.mock('@/lib/generation-context', () => ({runWithGenerationContext: (_c: unknown, fn: () => unknown) => fn()}));
jest.mock('@/lib/coach-harness/resume-evidence-runtime', () => ({evidenceSource: jest.fn(), runEvidenceComparison: jest.fn(),
  EVIDENCE_CALL_LIMIT: 6, EVIDENCE_SOURCE_TRACE: '789f2b98-4fce-4755-abca-33a950e7f73b'}));
const url = 'https://example.invalid/api/admin/resume-comparisons/harness';
const body = {sourceTraceId: EVIDENCE_SOURCE_TRACE, arm: 'without_memory', acknowledgeCost: true};
const req = (b: unknown = body, origin = 'https://example.invalid') => new Request(url,
  {method: 'POST', headers: {origin, 'content-type': 'application/json'}, body: JSON.stringify(b)});
const oldAdmins = process.env.EVAL_ADMIN_USER_IDS, oldStub = process.env.LLM_STUB;
beforeEach(() => {jest.clearAllMocks(); jest.useFakeTimers().setSystemTime(new Date('2026-10-31T00:00Z'));
  process.env.EVAL_ADMIN_USER_IDS = 'admin'; delete process.env.LLM_STUB;
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id: 'admin'});
  (getTokenPayCredential as jest.Mock).mockResolvedValue({available: true});
  (evidenceSource as jest.Mock).mockReturnValue({sourceHash: 'same-source', boundaryHash: 'B05', knowledgeHash: 'same-knowledge',
    payload: {source: 'same-source', contract: {request: 'same-request'}}, snapshot: {documents: []}});
});
afterEach(() => jest.useRealTimers());
afterAll(() => {
  if (oldAdmins === undefined) delete process.env.EVAL_ADMIN_USER_IDS; else process.env.EVAL_ADMIN_USER_IDS = oldAdmins;
  if (oldStub === undefined) delete process.env.LLM_STUB; else process.env.LLM_STUB = oldStub;
});
function database(results: Array<{data?: unknown; error?: unknown}>) {
  const writes: Array<{kind: string; value: unknown}> = [], filters: unknown[] = [];
  (getDbClient as jest.Mock).mockResolvedValue({from: (table: string) => {
    expect(table).toBe('coach_eval_runs'); const result = results.shift() || {data: [{id: 'saved'}]};
    const q: Record<string, unknown> = {then: (resolve: (x: unknown) => void) => resolve(result)};
    q.select = () => q; q.eq = (...args: unknown[]) => {filters.push(args); return q;};
    for (const method of ['insert', 'update']) q[method] = (value: unknown) => {writes.push({kind: method, value}); return q;};
    q.maybeSingle = () => Promise.resolve(result); return q;
  }}); return {writes, filters};
}
test('auth, CSRF, fixed input/model budget and cost consent refuse before DB/model', async () => {
  for (const user of [null, {id: 'ordinary'}]) {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(user);
    expect([401, 403]).toContain((await POST(req())).status);
  }
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id: 'admin'});
  expect((await POST(req(body, 'https://evil.invalid'))).status).toBe(403);
  for (const extra of [{...body, userId: 'victim'}, {...body, model: 'another'}, {...body, acknowledgeCost: false},
    {...body, sourceTraceId: 'another'}, {...body, maxCalls: 20}]) expect((await POST(req(extra))).status).toBe(400);
  expect(getDbClient).not.toHaveBeenCalled(); expect(callLLM).not.toHaveBeenCalled();
});
test('source owner is checked, missing credential never falls back, spent reservation is idempotent', async () => {
  const missing = database([{data: null}]);
  expect((await POST(req())).status).toBe(404); expect(missing.filters).toContainEqual(['user_id', 'admin']);
  database([{data: {run: {}}}]); (getTokenPayCredential as jest.Mock).mockResolvedValue(null);
  expect((await POST(req())).status).toBe(409);
  (getTokenPayCredential as jest.Mock).mockResolvedValue({available: true});
  database([{data: {run: {}}}, {error: {code: '23505'}}]);
  expect((await POST(req())).status).toBe(409); expect(runEvidenceComparison).not.toHaveBeenCalled();
});
test('same model, no retries, only Eval writes; result requires confirmed persistence', async () => {
  const {writes} = database([{data: {run: {}}}, {}, {data: [{id: 'saved'}]}]);
  (callLLM as jest.Mock).mockImplementation(async (_m, options) => {
    expect(options).toMatchObject({provider: 'tokendance', model: 'deepseek-v4-flash', requireExactConnectedModel: true,
      maxRetries: 0, thinking: 'disabled'});
    options.onUsage({model: 'deepseek-v4-flash', provider: 'tokendance', inputTokens: 10, outputTokens: 4}); return '{}';
  });
  (runEvidenceComparison as jest.Mock).mockImplementation(async ({invoke}) => {
    await invoke([{role: 'user', content: 'fixed'}], 'edit', 1);
    return {status: 'completed', draft: {}, calls: 1};
  });
  const response = await POST(req());
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({saved: true, delivered: false});
  expect(writes[0].kind).toBe('insert');
  expect(writes.at(-1)?.value).toMatchObject({run: {executionScope: 'isolated_admin_eval_no_domain_writes'}});
  database([{data: {run: {}}}, {}, {data: []}]);
  expect((await POST(req())).status).toBe(503);
});
test('a failed checkpoint stops before any subsequent upstream call and records failure', async () => {
  database([{data: {run: {}}}, {}, {error: {code: 'storage_failed'}}, {data: [{id: 'saved'}]}]);
  (runEvidenceComparison as jest.Mock).mockImplementation(async ({checkpoint, invoke}) => {
    await checkpoint(); await invoke([], 'edit', 1);
  });
  const response = await POST(req()); expect((await response.json()).status).toBe('failed');
  expect(callLLM).not.toHaveBeenCalled();
});
test('restored current task is identical in both arms; old weak-goal control is not reused as a same-input baseline', async () => {
  database([{data: {run: {}}}, {error: {code: '23505'}}]);
  const response = await POST(req({...body, arm: 'without_memory'}));
  expect(response.status).toBe(409); expect(await response.json()).not.toHaveProperty('reused');
  expect((evidenceSource as jest.Mock).mock.results.at(-1)?.value.payload.contract.request).toBe(CURRENT_EVIDENCE_REQUEST);
  expect(getTokenPayCredential).toHaveBeenCalled();
  expect(callLLM).not.toHaveBeenCalled(); expect(runEvidenceComparison).not.toHaveBeenCalled();
});
test('completed Memory is reused only with exact frozen identity; no reservation or model call is repeated', async () => {
  const run = {id: '24eaa04c-76bd-43bb-aa86-6161094a5422', status: 'completed',
    model: 'deepseek-v4-flash', provider: 'tokendance', harnessVersion: 'resume-evidence-harness/M07.1',
    input: {arm: 'with_memory', sourceHash: 'same-source', boundaryHash: 'B05', knowledgeHash: 'same-knowledge',
      requestHash: createHash('sha256').update(CURRENT_EVIDENCE_REQUEST).digest('hex')},
    spans: [{}, {}, {}], result: {rawResponse: {loadedFacts: [{id: 'selected'}]}}};
  const {writes, filters} = database([{data: {run: {}}}, {data: {run}}]);
  const response = await POST(req({...body, arm: 'with_memory'}));
  expect(await response.json()).toMatchObject({id: run.id, reused: true, calls: 3, newCalls: 0, delivered: false});
  expect(filters).toContainEqual(['user_id', 'admin']); expect(writes).toEqual([]);
  expect(getTokenPayCredential).not.toHaveBeenCalled(); expect(callLLM).not.toHaveBeenCalled();
  expect(runEvidenceComparison).not.toHaveBeenCalled();
  for (const bad of [{...run, status: 'failed'}, {...run, input: {...run.input, boundaryHash: 'changed'}},
    {...run, result: {rawResponse: {loadedFacts: []}}}]) {
    const db = database([{data: {run: {}}}, {data: {run: bad}}]);
    expect((await POST(req({...body, arm: 'with_memory'}))).status).toBe(409);
    expect(db.writes).toEqual([]);
  }
});
test('consent window expires closed and stub execution cannot masquerade as real', async () => {
  process.env.LLM_STUB = '1'; expect((await POST(req())).status).toBe(409);
  delete process.env.LLM_STUB;
  jest.setSystemTime(new Date('2026-11-04T00:00Z')); expect((await POST(req())).status).toBe(410);
  expect(getDbClient).not.toHaveBeenCalled();
});
