import { NextRequest } from 'next/server';
import { middleware } from './middleware';
import { verifySessionToken } from '@/lib/session';
jest.mock('@/lib/session', () => ({ verifySessionToken: jest.fn() }));
beforeEach(() => { jest.resetAllMocks(); (verifySessionToken as jest.Mock).mockResolvedValue(null); });
test('privacy notice is readable without a cookie or auth check', async () => {
  const response = await middleware(new NextRequest('https://example.com/privacy'));
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(verifySessionToken).not.toHaveBeenCalled();
});
test.each(['/cockpit', '/privacy-export'])('opening privacy does not expose protected route %s', async path => {
  const response = await middleware(new NextRequest('https://example.com' + path));
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toContain('/login?redirect=');
  expect(verifySessionToken).toHaveBeenCalled();
});
