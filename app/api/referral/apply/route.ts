import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCurrentUserId } from '@/lib/auth';
import { getDbClient } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * POST /api/referral/apply
 * 应用邀请码（新用户注册后调用）
 * 请求体: { referralCode: string }
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const referralCode = body?.referralCode?.trim()?.toUpperCase();

    if (!referralCode) {
      return NextResponse.json({ ok: false, error: '请输入邀请码' }, { status: 400 });
    }

    const client = await getDbClient();
    if (!client) {
      return NextResponse.json({ ok: false, error: '服务暂不可用' }, { status: 503 });
    }

    // 不能邀请自己
    if (userId.substring(0, 8).toUpperCase() === referralCode) {
      return NextResponse.json({ ok: false, error: '不能使用自己的邀请码' }, { status: 400 });
    }

    // 检查是否已经被邀请过
    const { data: existingReferral } = await client
      .from('referrals')
      .select('id')
      .eq('referee_id', userId)
      .limit(1)
      .single();

    if (existingReferral) {
      return NextResponse.json({ ok: false, error: '你已经使用过邀请码了' }, { status: 400 });
    }

    // 通过 Supabase Auth admin API 查找推荐人（邀请码 = userId 前8位）
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ ok: false, error: '服务配置错误' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const referrer = allUsers?.users?.find(
      (u: any) => u.id.substring(0, 8).toUpperCase() === referralCode
    );

    if (!referrer) {
      return NextResponse.json({ ok: false, error: '邀请码无效' }, { status: 400 });
    }

    // 记录邀请关系（使用完整 UUID 作为 referrer_id）
    await client.from('referrals').insert({
      referrer_id: referrer.id,
      referee_id: userId,
      referral_code: referralCode,
      reward_granted: true,
    });

    // 给双方增加额度
    const REWARD_CHAT = 3;
    for (const uid of [userId, referrer.id]) {
      const { data: quota } = await client
        .from('user_quotas')
        .select('paid_chat_remaining')
        .eq('user_id', uid)
        .single();

      if (quota) {
        await client
          .from('user_quotas')
          .update({
            paid_chat_remaining: (quota.paid_chat_remaining || 0) + REWARD_CHAT,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', uid);
      }
    }

    return NextResponse.json({
      ok: true,
      message: `邀请码生效！你和推荐人各获得 ${REWARD_CHAT} 次额外对话机会`,
      reward: REWARD_CHAT,
    });
  } catch (err) {
    console.error('referral apply error:', err);
    return NextResponse.json({ ok: false, error: '服务器错误' }, { status: 500 });
  }
}
