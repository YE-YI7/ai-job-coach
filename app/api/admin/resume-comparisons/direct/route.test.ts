import {POST} from './route';
import {getCurrentUserFromRequest} from '@/lib/auth';
import {getDbClient} from '@/lib/db';
import {directComparisonModel} from '@/lib/direct-comparison-model';
import {COLUMN_IDS} from '@/lib/coach-harness/resume-comparison';
jest.mock('@/lib/auth', () => ({getCurrentUserFromRequest: jest.fn()}));
jest.mock('@/lib/db', () => ({getDbClient: jest.fn()}));
jest.mock('@/lib/direct-comparison-model', () => ({directComparisonModel: jest.fn()}));
const id = '1091ba32-5af2-43a7-bf82-af551af83284', url = 'https://example.invalid/api/admin/resume-comparisons/direct';
const sample = {schemaVersion: 'yizhi.resume-comparison/v1', id, title: '虚构同稿', notes: [], model: 'deepseek-v4-flash',
  provider: 'tokendance', input: {resume: '虚构材料', jd: ''}, columns: COLUMN_IDS.map(id => ({id, label: id, status: '只读',
    provenance: '夹具', sections: [{id: 'opening', label: '开头', text: '虚构材料'}], judgments: [], traceIds: [], changeIds: [], runIds: []}))};
const request = (body: unknown = {id, acknowledgeCost: true}, origin = 'https://example.invalid') =>
  new Request(url, {method: 'POST', headers: {origin, 'content-type': 'application/json'}, body: JSON.stringify(body)});
const original = process.env.EVAL_ADMIN_USER_IDS;
beforeEach(() => {jest.clearAllMocks(); process.env.EVAL_ADMIN_USER_IDS = 'admin';
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id: 'admin'});});
afterAll(() => {if (original === undefined) delete process.env.EVAL_ADMIN_USER_IDS; else process.env.EVAL_ADMIN_USER_IDS = original;});
function database(results: Array<{data?: unknown; error?: unknown}>) {
  const writes: Array<{kind: string; value: unknown}> = [];
  const from = jest.fn((table: string) => {
    expect(table).toBe('coach_eval_runs'); const result = results.shift() || {data: [], error: null};
    const q: Record<string, unknown> = {then: (resolve: (v: unknown) => void) => resolve(result)};
    for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q;
    for (const m of ['insert', 'update']) q[m] = (value: unknown) => {writes.push({kind: m, value}); return q;};
    q.maybeSingle = () => Promise.resolve(result); return q;
  });
  (getDbClient as jest.Mock).mockResolvedValue({from}); return {writes};
}
test('cost acknowledgment, existing admin and same origin are required before any model or DB', async () => {
  expect((await POST(request({id}))).status).toBe(400);
  expect((await POST(request(undefined, 'https://evil.invalid'))).status).toBe(403);
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id: 'ordinary'});
  expect((await POST(request())).status).toBe(403);
  expect(getDbClient).not.toHaveBeenCalled(); expect(directComparisonModel).not.toHaveBeenCalled();
});
test.each([[{status: 'completed'}, {status: 'failed'}, {status: 'failed'}], [{status: 'running'}]])(
  'three spent slots or a running attempt refuse another call', async (...attempts) => {
    database([{data: {run: {comparison: sample}}}, {data: attempts}]);
    expect((await POST(request())).status).toBe(409); expect(directComparisonModel).not.toHaveBeenCalled();
  });
test('a competing reservation cannot issue a duplicate upstream call', async () => {
  database([{data: {run: {comparison: sample}}}, {data: []}, {error: {code: '23505'}}]);
  expect((await POST(request())).status).toBe(409); expect(directComparisonModel).not.toHaveBeenCalled();
});
test('one call uses the stored exact model/material, then retains the real output and Trace', async () => {
  const {writes} = database([{data: {run: {comparison: sample}}}, {data: []}, {}, {data: [{id: 'saved'}]}]);
  (directComparisonModel as jest.Mock).mockResolvedValue({text: JSON.stringify({sections: [{id: 'opening', text: '修改内容'}],
    decisions: ['只针对材料作取舍']}), finishReason: 'stop', usage: {provider: 'tokendance', model: sample.model}});
  expect((await POST(request())).status).toBe(200); expect(directComparisonModel).toHaveBeenCalledTimes(1);
  const args = (directComparisonModel as jest.Mock).mock.calls[0][0];
  expect(args.model).toBe(sample.model); expect(args.userId).toBe('admin');
  expect(JSON.parse(args.messages[1].content).resume).toBe(sample.input.resume);
  expect(args.messages[0].content).toContain('text是你编辑后的正文');
  expect(args.messages[0].content).not.toContain('完全相同的id、label、text');
  expect(writes[0].kind).toBe('insert');
  expect(writes[1].value).toMatchObject({status: 'completed', run: {sections: [{text: '修改内容'}]}});
});
test('transport failure is retained as failed without retry; malformed output never masquerades as a deletion', async () => {
  for (const text of [null, '{"sections":[],"decisions":[]}']) {
    const {writes} = database([{data: {run: {comparison: sample}}}, {data: []}, {}, {data: [{id: 'saved'}]}]);
    if (text === null) (directComparisonModel as jest.Mock).mockRejectedValue(Error('provider failed'));
    else (directComparisonModel as jest.Mock).mockResolvedValue({text, finishReason: 'stop'});
    const r = await POST(request()); expect(r.status).toBe(200); expect((await r.json()).status).toBe('failed');
    expect(writes[1].value).toMatchObject({run: {status: 'failed', sections: []}});
  }
  expect(directComparisonModel).toHaveBeenCalledTimes(2);
});
