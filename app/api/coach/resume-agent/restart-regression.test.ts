import { POST, GET } from './route';
import { POST as draft } from '../resume-draft/route';
import { getDbClient } from '@/lib/db';
import { FakeDb } from '@/lib/coach-harness/run-ledger/testing/fake-db';
import { resumeTaskFingerprint } from '@/lib/coach-harness/resume-task';
import { resumeRequestFeedback } from '@/lib/coach-harness/resume-request-feedback';

jest.mock('@/lib/db');
jest.mock('@/lib/auth', () => ({ getCurrentUserFromRequest: jest.fn().mockResolvedValue({ id: 'owner' }) }));
jest.mock('../resume-draft/route', () => ({ POST: jest.fn() }));
jest.mock('@/lib/coach-harness/resume-conversation', () => ({ runResumeConversation: jest.fn() }));
jest.mock('@/lib/coach-harness/resume-trace', () => ({
  readResumeTrace: jest.fn().mockResolvedValue(null), readResumeProcessing: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/lib/coach-harness/resume-delivery-record', () => ({
  readResumeDelivery: jest.fn().mockResolvedValue(null),
  recordResumeServerEvent: jest.fn().mockResolvedValue('recorded'), recordResumeDocument: jest.fn().mockResolvedValue(undefined),
}));
const id = '12345678-1234-4234-9234-123456789abc';
const source = '虚构案例：整理客服反馈，核对引用来源，并将问题交给产品经理。';
const old = { changes: [{ id: 'old', before: source, after: '上轮成稿', status: 'accepted' }], resumeGenerationId: 'task:4' };
const request = (action: string) => new Request('https://example.test/api/coach/resume-agent', {
  method: 'POST', body: JSON.stringify({ opportunityId: id, action }),
});
let db: FakeDb;
beforeEach(() => {
  jest.clearAllMocks();
  db = new FakeDb({
    coach_opportunities: [{ id, user_id: 'owner', status: 'active', jd_text: '',
      metadata: { resumeText: source, workspaceType: 'preparation', resumeRevision: 'rev', resumeChanges: old.changes } }],
    coach_resume_tasks: [{ id: 'task', user_id: 'owner', opportunity_id: id,
      fingerprint: resumeTaskFingerprint(source, '', 'rev'), source_revision: 'rev', state: 'ready',
      question: null, answers: [], result: old, error: null, lease_id: null, version: 5, updated_at: '2026-11-09T14:24:48Z' }],
  });
  (getDbClient as jest.Mock).mockResolvedValue(db);
  // The paid generator and persistence service are substituted; the HTTP route,
  // owner lookup, claim/CAS, replay decision, readback and receipt are real code.
  (draft as jest.Mock).mockImplementation(async (input: Request) => {
    const body = await input.json();
    expect(body.resumeText).toBe(source);
    expect(body.requestId).toBe('resume-task:task:7');
    const result = { changes: [{ id: 'new', before: source, after: '本轮新成稿', status: 'pending' }], resumeGenerationId: 'task:7' };
    Object.assign(db.rows('coach_resume_tasks')[0], { state: 'ready', result, lease_id: null, version: 8 });
    return Response.json({ ok: true, task: { id: 'task', state: 'ready', result } });
  });
});
test('replays the production failure: start on ready returns old data without running the editor', async () => {
  const body = await (await POST(request('start'))).json();
  expect(body).toMatchObject({ ok: true, replayed: true, task: { state: 'ready', result: old } });
  expect(draft).not.toHaveBeenCalled();
  expect(db.rows('coach_resume_tasks')[0].version).toBe(5);
  expect(resumeRequestFeedback(body, 'start')).toContain('本次没有生成新稿');
});
test('confirmed restart with no task GET starts a new generation; refresh reads that generation', async () => {
  const body = await (await POST(request('restart'))).json();
  expect(draft).toHaveBeenCalledTimes(1);
  expect(body).toMatchObject({ ok: true, task: { result: { resumeGenerationId: 'task:7' },
    delivery: { persistence: 'confirmed', outcome: 'delivered', deliveredCount: 1 } } });
  const refreshed = await (await GET(new Request(`https://example.test/api/coach/resume-agent?opportunityId=${id}`))).json();
  expect(refreshed.task.result).toEqual(body.task.result);
  expect(db.rows('interview_answers')).toEqual([]);
  expect(db.rows('watcha_wallets')).toEqual([]);
});
test('a double click cannot obtain two editor leases', async () => {
  await Promise.all([POST(request('restart')), POST(request('restart'))]);
  expect(draft).toHaveBeenCalledTimes(1);
});
test('an already-running request is recovered, never restarted or shown as complete', async () => {
  Object.assign(db.rows('coach_resume_tasks')[0], { state: 'running', updated_at: new Date().toISOString() });
  const body = await (await POST(request('restart'))).json();
  expect(body).toMatchObject({ replayed: true, task: { state: 'running' } });
  expect(resumeRequestFeedback(body, 'restart')).toContain('仍在进行');
  expect(draft).not.toHaveBeenCalled();
});
