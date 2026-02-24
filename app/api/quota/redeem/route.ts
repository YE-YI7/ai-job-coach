import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { getDbClient } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * POST /api/quota/redeem
 * 兑换码兑换额度
 * 请求体: { code: string }
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const code = body?.code?.trim();

    if (!code) {
      return NextResponse.json(
        { ok: false, error: '请输入兑换码' },
        { status: 400 }
      );
    }

    const client = await getDbClient();
    if (!client) {
      return NextResponse.json({ ok: false, error: '服务暂不可用' }, { status: 503 });
    }

    // 查找兑换码
    const { data: redemption, error: queryError } = await client
      .from('redemption_codes')
      .select('*')
      .eq('code', code)
      .eq('used', false)
      .single();

    if (queryError || !redemption) {
      return NextResponse.json(
        { ok: false, error: '兑换码无效或已被使用' },
        { status: 400 }
      );
    }

    // 先标记兑换码为已使用（乐观锁：利用 used=false 条件防止并发重复兑换）
    const { data: markResult, error: markError } = await client
      .from('redemption_codes')
      .update({
        used: true,
        used_by: userId,
        used_at: new Date().toISOString(),
      })
      .eq('id', redemption.id)
      .eq('used', false)
      .select()
      .single();

    if (markError || !markResult) {
      return NextResponse.json(
        { ok: false, error: '兑换码已被使用' },
        { status: 409 }
      );
    }

    const quotaConfig = redemption.quota_config as Record<string, number>;

    // 更新用户额度
    const { data: currentQuota } = await client
      .from('user_quotas')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (currentQuota) {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (quotaConfig.chat) updates.paid_chat_remaining = (currentQuota.paid_chat_remaining || 0) + quotaConfig.chat;
      if (quotaConfig.resume) updates.paid_resume_remaining = (currentQuota.paid_resume_remaining || 0) + quotaConfig.resume;
      if (quotaConfig.interview) updates.paid_interview_remaining = (currentQuota.paid_interview_remaining || 0) + quotaConfig.interview;

      await client
        .from('user_quotas')
        .update(updates)
        .eq('user_id', userId);
    } else {
      await client.from('user_quotas').insert({
        user_id: userId,
        paid_chat_remaining: quotaConfig.chat || 0,
        paid_resume_remaining: quotaConfig.resume || 0,
        paid_interview_remaining: quotaConfig.interview || 0,
        last_free_reset: new Date().toISOString().split('T')[0],
      });
    }

    return NextResponse.json({
      ok: true,
      product_type: redemption.product_type,
      quota_added: quotaConfig,
      message: '兑换成功！',
    });
  } catch (err) {
    console.error('redeem error:', err);
    return NextResponse.json({ ok: false, error: '服务器错误' }, { status: 500 });
  }
}
