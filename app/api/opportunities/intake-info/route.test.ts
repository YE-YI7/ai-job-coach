import { GET } from './route';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hasActiveTokenPayConnection } from '@/lib/tokenpay';
import { hostedStepModel } from '@/lib/hosted-model';
jest.mock('@/lib/auth', () => ({ getCurrentUserFromRequest: jest.fn() }));
jest.mock('@/lib/tokenpay', () => ({ hasActiveTokenPayConnection: jest.fn() }));
jest.mock('@/lib/hosted-model', () => ({ hostedStepModel: jest.fn() }));
beforeEach(() => { jest.resetAllMocks(); (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: 'test-user' }); });
test('does not expose provider configuration before login', async () => {
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect(hasActiveTokenPayConnection).not.toHaveBeenCalled();
});
test.each([[true, true, 'TokenDance'], [false, true, 'StepFun'], [false, false, 'DeepSeek']])('reports actual selected provider %s %s', async (connected, step, name) => {
  (hasActiveTokenPayConnection as jest.Mock).mockResolvedValue(connected);
  (hostedStepModel as jest.Mock).mockReturnValue(step ? 'step-test' : null);
  const response = await GET();
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect((await response.json()).provider).toContain(name);
});
test('configuration read failure is visible, not a guessed provider', async () => {
  (hasActiveTokenPayConnection as jest.Mock).mockRejectedValue(Error('unavailable'));
  expect((await GET()).status).toBe(503);
});
