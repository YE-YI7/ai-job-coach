import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDbClient } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * 生成 session token 并设置 cookie 的通用函数
 */
function buildSessionResponse(userId: string, email: string, isNewUser: boolean) {
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
}

/**
 * POST /api/auth/verify-code
 * 验证邮箱验证码或邀请码，创建/查找用户，设置session cookie
 * 
 * 请求体: { email: string, code: string, referralCode?: string }
 * - code 可以是6位数字验证码，也可以是邀请码（invites表中的code）
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

    const client = await getDbClient();
    if (!client) {
      return NextResponse.json(
        { ok: false, error: '服务暂不可用' },
        { status: 503 }
      );
    }

    // ========== 优先尝试邀请码登录 ==========
    const { data: invite } = await client
      .from('invites')
      .select('*')
      .eq('code', code)
      .single();

    if (invite) {
      // 命中邀请码，走邀请码登录流程
      let userId: string;
      let isNewUser = false;

      if (invite.used === true && invite.redeemed_by) {
        // 邀请码已使用过，直接用已绑定的用户登录
        userId = invite.redeemed_by;
      } else {
        // 邀请码未使用，创建或查找用户
        const fakeEmail = `${code}@invite.local`;
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const existingUser = existingUsers?.users?.find((u: { email?: string }) => u.email === fakeEmail);

        if (existingUser) {
          userId = existingUser.id;
        } else {
          isNewUser = true;
          const randomPassword = crypto.randomUUID();
          const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
            email: fakeEmail,
            password: randomPassword,
            email_confirm: true,
          });

          if (createUserError || !newUser?.user) {
            return NextResponse.json(
              { ok: false, error: `创建用户失败: ${createUserError?.message || '未知错误'}` },
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

          // 更新邀请码状态
          const currentUsesCount = invite.uses_count || 0;
          const newUsesCount = currentUsesCount + 1;
          const maxUses = invite.max_uses || 1;
          const shouldMarkAsUsed = newUsesCount >= maxUses;

          const updateData: Record<string, unknown> = {
            uses_count: newUsesCount,
            redeemed_by: userId,
          };
          if (shouldMarkAsUsed) {
            updateData.used = true;
          }

          await client.from('invites').update(updateData).eq('code', code);
        }
      }

      console.log(`[AUTH] 邀请码登录: code=${code}, userId=${userId}, isNew=${isNewUser}`);
      return buildSessionResponse(userId, email, isNewUser);
    }

    // ========== 邀请码未命中，走验证码流程 ==========
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

    let userId: string;
    let isNewUser = false;

    // 按 email 精确查找用户
    const { data: usersByEmail } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const existingUser = usersByEmail?.users?.find(u => u.email === email);

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

      // 处理推荐码
      if (referralCode) {
        const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const referrer = allUsers?.users?.find(
          (u: { id: string }) => u.id.substring(0, 8).toUpperCase() === referralCode.toUpperCase()
        );

        if (referrer && referrer.id !== userId) {
          const REWARD_CHAT = 3;

          await client.from('referrals').insert({
            referrer_id: referrer.id,
            referee_id: userId,
            referral_code: referralCode,
            reward_granted: true,
          });

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

          await client.from('user_quotas').update({
            paid_chat_remaining: REWARD_CHAT,
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId);
        }
      }
    }

    return buildSessionResponse(userId, email, isNewUser);
  } catch (err) {
    console.error('verify-code API Error:', err);
    return NextResponse.json(
      { ok: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}
