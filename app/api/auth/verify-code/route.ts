import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDbClient } from '@/lib/db';
import { createSessionToken, sessionCookie } from '@/lib/session';
import { consumePublicRateLimit, rateLimitedResponse } from '@/lib/public-rate-limit';

export const runtime = 'nodejs';

/**
 * 生成 session token 并设置 cookie 的通用函数
 */
async function buildSessionResponse(userId: string, email: string, isNewUser: boolean) {
  const sessionToken = await createSessionToken(userId, email);

  const response = NextResponse.json({
    ok: true,
    userId,
    isNewUser,
  });

  response.cookies.set(sessionCookie.name, sessionToken, sessionCookie.options);
  response.cookies.set('sb-session-user-id', '', { ...sessionCookie.options, maxAge: 0 });

  return response;
}

/**
 * 获取 Supabase Admin 客户端（可选，如果有 SERVICE_ROLE_KEY）
 */
function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * 在 users 表中查找或创建用户
 */
async function findOrCreateUser(
  client: any,
  email: string,
  provider: string = 'email'
): Promise<{ userId: string; isNewUser: boolean }> {
  // 先按 email 查找
  const { data: existingUser } = await client
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existingUser) {
    // 更新最后活跃时间
    await client
      .from('users')
      .update({ last_active: new Date().toISOString() })
      .eq('id', existingUser.id);
    return { userId: existingUser.id, isNewUser: false };
  }

  // 创建新用户
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  // 尝试通过 Supabase Auth Admin 创建（如果可用，ID 会与 Auth 系统一致）
  const supabaseAdmin = getSupabaseAdmin();
  let authUserId: string | null = null;

  if (supabaseAdmin) {
    try {
      const randomPassword = crypto.randomUUID();
      const { data: newAuthUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
      });
      if (!authError && newAuthUser?.user) {
        authUserId = newAuthUser.user.id;
      }
    } catch (e) {
      console.warn('[AUTH] Supabase Auth 创建用户失败，使用自定义 ID:', e);
    }
  }

  const finalUserId = authUserId || userId;

  // 插入 users 表
  const { error: insertError } = await client
    .from('users')
    .insert({
      id: finalUserId,
      email,
      provider,
      created_at: now,
      last_active: now,
    });

  if (insertError) {
    // 可能是并发导致的冲突，再查一次
    const { data: retryUser } = await client
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (retryUser) {
      return { userId: retryUser.id, isNewUser: false };
    }
    throw insertError;
  }

  // 创建用户额度记录
  const today = now.split('T')[0];
  await client.from('user_quotas').insert({
    user_id: finalUserId,
    free_chat_daily: 3,
    free_resume_daily: 1,
    paid_chat_remaining: 0,
    paid_resume_remaining: 0,
    paid_interview_remaining: 0,
    last_free_reset: today,
  });

  return { userId: finalUserId, isNewUser: true };
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

    const [addressLimit, accountLimit] = await Promise.all([
      consumePublicRateLimit({ request, scope: 'auth-verify-ip', limit: 30, windowSeconds: 900 }),
      consumePublicRateLimit({ request, scope: 'auth-verify-account', subject: email, limit: 10, windowSeconds: 900 }),
    ]);
    if (!addressLimit.allowed) return rateLimitedResponse(addressLimit);
    if (!accountLimit.allowed) return rateLimitedResponse(accountLimit);

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
      let userId: string;
      let isNewUser = false;

      if (invite.used === true && invite.redeemed_by) {
        // 邀请码已使用过，直接用已绑定的用户登录
        userId = invite.redeemed_by;
        // 更新最后活跃时间
        await client.from('users').update({ last_active: new Date().toISOString() }).eq('id', userId);
      } else {
        // 邀请码未使用，创建或查找用户
        const inviteEmail = `${code}@invite.local`;
        const result = await findOrCreateUser(client, inviteEmail, 'invite');
        userId = result.userId;
        isNewUser = result.isNewUser;

        if (isNewUser) {
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

      return await buildSessionResponse(userId, email, isNewUser);
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

    // 查找或创建用户
    const { userId, isNewUser } = await findOrCreateUser(client, email, 'email');

    // 处理推荐码（仅新用户）
    if (isNewUser && referralCode) {
      try {
        // 通过推荐码前8位匹配 referrer
        const { data: allUsers } = await client
          .from('users')
          .select('id');

        const referrer = allUsers?.find(
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

          // 给新用户增加额度
          await client.from('user_quotas').update({
            paid_chat_remaining: REWARD_CHAT,
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId);
        }
      } catch (refErr) {
        console.warn('[AUTH] 处理推荐码失败:', refErr);
      }
    }

    return await buildSessionResponse(userId, email, isNewUser);
  } catch (err) {
    console.error('verify-code API Error:', err);
    return NextResponse.json(
      { ok: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}
