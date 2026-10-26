import {GET, POST, PATCH} from './route';
import {getCurrentUserFromRequest} from '@/lib/auth';
import {getDbClient} from '@/lib/db';
import {COLUMN_IDS} from '@/lib/coach-harness/resume-comparison';
jest.mock('@/lib/auth', () => ({getCurrentUserFromRequest: jest.fn()}));
jest.mock('@/lib/db', () => ({getDbClient: jest.fn()}));
const id = '1091ba32-5af2-43a7-bf82-af551af83284', url = 'https://example.invalid/api/admin/resume-comparisons';
const sample = {schemaVersion: 'yizhi.resume-comparison/v1', id, title: '虚构同稿', notes: [], model: 'deepseek-v4-flash',
  provider: 'tokendance', input: {resume: '虚构材料', jd: ''}, columns: COLUMN_IDS.map(id => ({id, label: id, status: '只读',
    provenance: '夹具', sections: [{id: 'opening', label: '开头', text: '虚构材料'}], judgments: [], traceIds: [], changeIds: [], runIds: []}))};
const req = (body: unknown, method = 'POST', origin = 'https://example.invalid') =>
  new Request(url, {method, headers: {origin}, body: JSON.stringify(body)});
const original = process.env.EVAL_ADMIN_USER_IDS;
beforeEach(() => {jest.clearAllMocks(); process.env.EVAL_ADMIN_USER_IDS = 'admin';
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id: 'admin'});});
afterAll(() => {if (original === undefined) delete process.env.EVAL_ADMIN_USER_IDS; else process.env.EVAL_ADMIN_USER_IDS = original;});
function database(results: Array<{data?: unknown; error?: unknown}>) {
  const queries: Array<{calls: Array<[string, unknown[]]>}> = [];
  const from = jest.fn((table: string) => {
    expect(table).toBe('coach_eval_runs');
    const result = results.shift() || {data: [], error: null}, calls: Array<[string, unknown[]]> = [];
    const query: Record<string, unknown> = {then: (resolve: (v: unknown) => void) => resolve(result)};
    for (const m of ['select', 'eq', 'order', 'limit', 'insert', 'update']) query[m] = (...args: unknown[]) => {calls.push([m, args]); return query;};
    query.maybeSingle = () => Promise.resolve(result); queries.push({calls}); return query;
  });
  (getDbClient as jest.Mock).mockResolvedValue({from}); return {queries, from};
}
test('anonymous and ordinary accounts cannot read source text or write a draft', async () => {
  for (const user of [null, {id: 'ordinary'}]) {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(user);
    expect([401, 403]).toContain((await GET(new Request(url))).status);
    expect([401, 403]).toContain((await PATCH(req({id, revision: 0, sections: {opening: 'x'}}, 'PATCH'))).status);
  }
  expect(getDbClient).not.toHaveBeenCalled();
});
test('CSRF, source mutation fields, huge body and invalid ids reject before database', async () => {
  expect((await POST(req(sample, 'POST', 'https://evil.invalid'))).status).toBe(403);
  expect((await PATCH(req({id, revision: 0, sections: {}, userId: 'victim'}, 'PATCH'))).status).toBe(400);
  expect((await POST(req({padding: 'x'.repeat(600000)}))).status).toBe(413);
  expect((await GET(new Request(url + '?id=bad'))).status).toBe(400);
  expect(getDbClient).not.toHaveBeenCalled();
});
test('draft save writes only a separate actor-owned Eval row with compare-and-swap revision', async () => {
  const {queries} = database([{data: {run: {comparison: sample}}}, {data: [{id: 'draft'}]}]);
  const result = await PATCH(req({id, revision: 2, sections: {opening: '本人版本'}}, 'PATCH'));
  expect(result.status).toBe(200); expect(await result.json()).toMatchObject({saved: true, draft: {revision: 3}});
  expect(queries[1].calls).toContainEqual(['eq', ['run->>revision', '2']]);
  expect(queries[1].calls).toContainEqual(['eq', ['user_id', 'admin']]);
  expect(queries[1].calls.find(([m]) => m === 'update')?.[1][0]).toMatchObject({run: {recordType: 'resume_comparison_draft'}});
});
test('stale save and concurrent first creation return conflict, never overwrite a newer draft', async () => {
  database([{data: {run: {comparison: sample}}}, {data: []}]);
  expect((await PATCH(req({id, revision: 2, sections: {opening: 'x'}}, 'PATCH'))).status).toBe(409);
  database([{data: {run: {comparison: sample}}}, {error: {code: '23505'}}]);
  expect((await PATCH(req({id, revision: 0, sections: {opening: 'x'}}, 'PATCH'))).status).toBe(409);
});
test('ownership is checked before any draft lookup/write and source records are append-only', async () => {
  const {queries} = database([{data: null}]);
  expect((await PATCH(req({id, revision: 0, sections: {opening: 'x'}}, 'PATCH'))).status).toBe(404);
  expect(queries).toHaveLength(1); expect(queries[0].calls).toContainEqual(['eq', ['user_id', 'admin']]);
  database([{error: {code: '23505'}}]); expect((await POST(req(sample))).status).toBe(409);
});
