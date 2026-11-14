import {cookies} from 'next/headers';
import {getCurrentUserFromRequest} from './auth';
import {verifySessionToken} from './session';
import {getDbClient} from './db';
import {canReadEvals, isEvalAdmin, isEvalReadOnly} from './coach-harness/eval-access';
jest.mock('next/headers', () => ({cookies: jest.fn()}));
jest.mock('./session', () => ({verifySessionToken: jest.fn()}));
jest.mock('./db', () => ({getDbClient: jest.fn()}));
const previous = process.env.EVAL_VIEWER_USER_IDS;
afterAll(() => {if (previous === undefined) delete process.env.EVAL_VIEWER_USER_IDS;
  else process.env.EVAL_VIEWER_USER_IDS = previous;});
beforeEach(() => {
  jest.resetAllMocks(); process.env.EVAL_VIEWER_USER_IDS = 'review-reader';
  (cookies as jest.Mock).mockResolvedValue({get: () => ({value: 'signed-session'})});
  (verifySessionToken as jest.Mock).mockResolvedValue({userId: 'review-reader', email: 'reader@invite.local'});
});
test('a dedicated reader is denied by default in existing ordinary product/auth callers', async () => {
  expect(await getCurrentUserFromRequest()).toBeNull();
  expect(getDbClient).not.toHaveBeenCalled();
});
test('explicit server-side Eval read caller gets only the verified identity, never an administrator grant', async () => {
  const user = await getCurrentUserFromRequest({allowEvalViewer: true});
  expect(user).toEqual({id: 'review-reader', email: 'reader@invite.local'});
  expect(isEvalReadOnly(user)).toBe(true); expect(canReadEvals(user)).toBe(true); expect(isEvalAdmin(user)).toBe(false);
});
test('normal users keep the existing login path', async () => {
  (verifySessionToken as jest.Mock).mockResolvedValue({userId: 'ordinary', email: 'ordinary@example.invalid'});
  expect(await getCurrentUserFromRequest()).toEqual({id: 'ordinary', email: 'ordinary@example.invalid'});
});
test('an invalid session cannot opt itself into Eval by a caller option', async () => {
  (cookies as jest.Mock).mockResolvedValue({get: () => undefined});
  (verifySessionToken as jest.Mock).mockResolvedValue(null);
  expect(await getCurrentUserFromRequest({allowEvalViewer: true})).toBeNull();
});
