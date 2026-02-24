import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDbClient } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * POST /api/auth/verify-code
 * 验证邮箱验证码，创建/查找用户，设置session cookie
 * 
 * 请求体: { email: string, code: string, referralCode?: string }
 * 返回: { ok: boolean, userId?: string, isNewUser?: boolean, error?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body?.email || !body?.code) {
      return NextResponse.json(
        { ok: false, error: '请输入邮箱和验证码' },
        { status: 400 }
      );
    }

    const email = body.email.trim().toLowerCase();
    const code = body.code.trim();
    const referralCode = body.referralCode?.trim() || null;

    const client = await getDbClient();
    if (!client) {
      return NextResponse.json(
        { ok: false, error: '服务暂不可用' },
        { status: 503 }
      );
    }

    // 查找有效的验证码
    const { data: verificationRecord, error: queryError } = await client
      .from('email_verification_codes')
      .select('*')
      .eq('email', email)
      .eq('code', code)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (queryError || !verificationRecord) {
      return NextResponse.json(
        { ok: false, error: '验证码无效或已过期' },
        { status: 400 }
      );
    }

    // 标记验证码为已使用
    await client
      .from('email_verification_codes')
      .update({ used: true })
      .eq('id', verificationRecord.id);

    // 创建或查找 Supabase Auth 用户
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { ok: false, error: '认证服务未配置' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let userId: string;
    let isNewUser = false;

    // 按 email 精确查找用户（避免 listUsers 分页问题，只返回前50个用户）
    const { data: usersByEmail } = await supabaseAdmin.auth.admin.listUsers({
      filter: `email.eq.${email}`,
      page: 1,
      perPage: 1,
    });
    const existingUser = usersByEmail?.users?.[0];

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // 创建新用户
      isNewUser = true;
      const randomPassword = crypto.randomUUID();
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
      });

      if (createError || !newUser?.user) {
        return NextResponse.json(
          { ok: false, error: '创建用户失败' },
          { status: 500 }
        );
      }

      userId = newUser.user.id;

      // 创建用户额度记录
      const today = new Date().toISOString().split('T')[0];
      await client.from('user_quotas').insert({
        user_id: userId,
        free_chat_daily: 3,
        free_resume_daily: 1,
        paid_chat_remaining: 0,
        paid_resume_remaining: 0,
        paid_interview_remaining: 0,
        last_free_reset: today,
      });

      // 处理邀请码：邀请码 = 推荐人 userId 的前8位
      if (referralCode) {
        // 通过 Supabase Auth 查找所有用户中 id 以 referralCode 开头的（即推荐人）
        const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const referrer = allUsers?.users?.find(
          (u: any) => u.id.substring(0, 8).toUpperCase() === referralCode.toUpperCase()
        );

        if (referrer && referrer.id !== userId) {
          const REWARD_CHAT = 3;

          // 记录邀请关系（referrer_id 使用完整 UUID）
          await client.from('referrals').insert({
            referrer_id: referrer.id,
            referee_id: userId,
            referral_code: referralCode,
            reward_granted: true,
          });

          // 给推荐人增加额度
          const { data: referrerQuota } = await client
            .from('user_quotas')
            .select('paid_chat_remaining')
            .eq('user_id', referrer.id)
            .single();

          if (referrerQuota) {
            await client.from('user_quotas').update({
              paid_chat_remaining: (referrerQuota.paid_chat_remaining || 0) + REWARD_CHAT,
              updated_at: new Date().toISOString(),
            }).eq('user_id', referrer.id);
          }

          // 给被邀请人增加额度
          await client.from('user_quotas').update({
            paid_chat_remaining: REWARD_CHAT,
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId);
        }
      }
    }

    // 生成 session token
    const sessionToken = Buffer.from(JSON.stringify({
      userId,
      email,
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // 7天
    })).toString('base64');

    const response = NextResponse.json({
      ok: true,
      userId,
      isNewUser,
    });

    // 设置 cookie（httpOnly: false 以便客户端 useAuth 检测登录状态）
    response.cookies.set('sb-access-token', sessionToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    response.cookies.set('sb-session-user-id', userId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('verify-code API Error:', err);
    return NextResponse.json(
      { ok: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}
