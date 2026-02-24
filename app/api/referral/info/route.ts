import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { getDbClient } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET /api/referral/info
 * 获取当前用户的邀请信息
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 });
    }

    const client = await getDbClient();
    if (!client) {
      return NextResponse.json({ ok: false, error: '服务暂不可用' }, { status: 503 });
    }

    // 生成或获取邀请码（基于userId的短码）
    const referralCode = userId.substring(0, 8).toUpperCase();

    // 查询邀请记录
    const { data: referrals } = await client
      .from('referrals')
      .select('id, referee_id, reward_granted, created_at')
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false });

    const totalInvited = referrals?.length || 0;
    const totalRewarded = referrals?.filter((r: { reward_granted: boolean }) => r.reward_granted)?.length || 0;

    return NextResponse.json({
      ok: true,
      referralCode,
      referralLink: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/login?ref=${referralCode}`,
      totalInvited,
      totalRewarded,
      rewardPerInvite: 3, // 每次邀请奖励3次对话
      referrals: referrals?.slice(0, 10) || [],
    });
  } catch (err) {
    console.error('referral info error:', err);
    return NextResponse.json({ ok: false, error: '服务器错误' }, { status: 500 });
  }
}
