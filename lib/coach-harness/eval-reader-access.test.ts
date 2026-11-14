import {getCurrentUserFromRequest} from '@/lib/auth';
import {getDbClient} from '@/lib/db';
import {isEvalAdmin, canReadEvals} from './eval-access';
import {evalAdminAccess} from './eval-admin-http';
import {POST as archive} from '@/app/api/admin/eval-records/route';
import {POST as experiment} from '@/app/api/admin/eval-runs/route';
import {POST as direct} from '@/app/api/admin/resume-comparisons/direct/route';
jest.mock('@/lib/auth', () => ({getCurrentUserFromRequest: jest.fn()}));
jest.mock('@/lib/db', () => ({getDbClient: jest.fn()}));
const before = {reader: process.env.EVAL_VIEWER_USER_IDS, admins: process.env.EVAL_ADMIN_USER_IDS};
beforeEach(() => {
  jest.clearAllMocks(); process.env.EVAL_VIEWER_USER_IDS = 'reader'; process.env.EVAL_ADMIN_USER_IDS = 'admin';
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id: 'reader'});
});
afterAll(() => {
  for (const [key, value] of [['EVAL_VIEWER_USER_IDS', before.reader], ['EVAL_ADMIN_USER_IDS', before.admins]]) {
    if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
  }
});
test('read scope is explicit and write access is denied before any database/model action', async () => {
  expect((await evalAdminAccess({readOnly: true})).error).toBeNull();
  expect((await evalAdminAccess()).error?.status).toBe(403);
  expect(getDbClient).not.toHaveBeenCalled();
});
test.each([archive, experiment, direct])('reader cannot archive, run models, or direct-call a model', async action => {
  const response = await action(new Request('https://yizhioffer.com/api/admin/eval-runs', {
    method: 'POST', headers: {Origin: 'https://yizhioffer.com', 'Content-Type': 'application/json'}, body: '{}',
  }));
  expect(response.status).toBe(403); expect(getDbClient).not.toHaveBeenCalled();
});
test('a reader grant cannot accidentally inherit a mutable administrator grant', () => {
  process.env.EVAL_ADMIN_USER_IDS = 'admin,reader';
  expect(isEvalAdmin({id: 'reader'})).toBe(false); expect(canReadEvals({id: 'reader'})).toBe(true);
  expect(isEvalAdmin({id: 'admin'})).toBe(true);
});
test('ordinary authenticated and anonymous principals are still not readers', async () => {
  expect(canReadEvals({id: 'someone'})).toBe(false); expect(canReadEvals(null)).toBe(false);
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);
  expect((await evalAdminAccess({readOnly: true})).error?.status).toBe(401);
});
