import { getCurrentUserFromRequest } from '@/lib/auth';
import { getWatchaPayAccess, WatchaPayError } from '@/lib/watcha-pay';
import { getWatchaPointBalance, getPendingWatchaTransfer, redeemWatchaPoints } from '@/lib/watcha-wallet';

export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'private, no-store' };
function failure(error: unknown) {
  return Response.json({ ok: false, error: '暂未确认积分到账。请稍后刷新或重试兑换；相同兑换不会重复扣渠道积分。',
    code: error instanceof WatchaPayError ? error.code : 'wallet_unavailable' }, { status: error instanceof WatchaPayError ? error.status : 503, headers });
}
export async function GET() {
  const user = await getCurrentUserFromRequest();
  if (!user) return Response.json({ ok: false, error: '请先登录' }, { status: 401, headers });
  try {
    const account = await getWatchaPayAccess(user.id, 'chat');
    const balance = account.configured ? await getWatchaPointBalance(user.id) : 0;
    const pending = account.configured ? await getPendingWatchaTransfer(user.id) : null;
    return Response.json({ ok: true, account, balance, pendingAmount: pending?.amount ?? 0 }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return Response.json({ ok: false, error: '请先登录' }, { status: 401, headers });
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ ok: false, error: '请在益职站内操作' }, { status: 403, headers });
  }
  const body = await request.json().catch(() => null);
  if (!body || Object.keys(body).length !== 1 || body.confirmExchange !== true) {
    return Response.json({ ok: false, error: '请先确认兑换规则' }, { status: 400, headers });
  }
  try { return Response.json({ ok: true, ...(await redeemWatchaPoints(user.id)) }, { headers }); }
  catch (error) { return failure(error); }
}
