import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';
import { sendVerificationEmail } from '@/lib/email';

export const runtime = 'nodejs';

/**
 * POST /api/auth/send-code
 * 发送邮箱验证码
 * 
 * 请求体: { email: string }
 * 返回: { ok: boolean, message?: string, error?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body?.email) {
      return NextResponse.json(
        { ok: false, error: '请输入邮箱地址' },
        { status: 400 }
      );
    }

    const email = body.email.trim().toLowerCase();

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { ok: false, error: '邮箱格式不正确' },
        { status: 400 }
      );
    }

    const client = await getDbClient();
    if (!client) {
      return NextResponse.json(
        { ok: false, error: '服务暂不可用' },
        { status: 503 }
      );
    }

    // 防重发：60秒内不可重复发送
    const { data: recentCode } = await client
      .from('email_verification_codes')
      .select('created_at')
      .eq('email', email)
      .eq('used', false)
      .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (recentCode) {
      return NextResponse.json(
        { ok: false, error: '发送太频繁，请60秒后重试' },
        { status: 429 }
      );
    }

    // 开发模式：使用固定验证码，跳过邮件发送
    const isDevBypass = process.env.DEV_BYPASS_CODE === '1';
    const code = isDevBypass ? '123456' : Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟过期

    // 存储验证码
    const { error: insertError } = await client
      .from('email_verification_codes')
      .insert({
        email,
        code,
        used: false,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error('存储验证码失败:', insertError);
      return NextResponse.json(
        { ok: false, error: '发送失败，请稍后重试' },
        { status: 500 }
      );
    }

    // 开发模式跳过邮件发送
    if (isDevBypass) {
      console.log(`[DEV] 验证码: ${code}，邮箱: ${email}`);
      return NextResponse.json({
        ok: true,
        message: '验证码已发送（开发模式：123456）',
      });
    }

    // 发送邮件
    const result = await sendVerificationEmail(email, code);
    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error || '发送失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: '验证码已发送到您的邮箱',
    });
  } catch (err) {
    console.error('send-code API Error:', err);
    return NextResponse.json(
      { ok: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}
