import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { consumeQuota } from '@/lib/quota';

export const runtime = 'nodejs';

/**
 * POST /api/quota/consume
 * 消费一次额度
 * 请求体: { type: 'chat' | 'resume' | 'interview' }
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const type = body?.type;

    if (!type || !['chat', 'resume', 'interview'].includes(type)) {
      return NextResponse.json(
        { ok: false, error: '无效的额度类型' },
        { status: 400 }
      );
    }

    const success = await consumeQuota(userId, type);
    if (!success) {
      return NextResponse.json(
        { ok: false, error: '额度不足', needUpgrade: true },
        { status: 403 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('quota consume error:', err);
    return NextResponse.json({ ok: false, error: '服务器错误' }, { status: 500 });
  }
}
