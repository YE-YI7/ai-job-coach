import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { checkQuota, getOrCreateQuota } from '@/lib/quota';

export const runtime = 'nodejs';

/**
 * GET /api/quota/check
 * 检查用户当前额度
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 });
    }

    const quota = await getOrCreateQuota(userId);
    const chatCheck = await checkQuota(userId, 'chat');
    const resumeCheck = await checkQuota(userId, 'resume');
    const interviewCheck = await checkQuota(userId, 'interview');

    return NextResponse.json({
      ok: true,
      quota: {
        free_chat_daily: quota.free_chat_daily,
        free_resume_daily: quota.free_resume_daily,
        paid_chat_remaining: quota.paid_chat_remaining,
        paid_resume_remaining: quota.paid_resume_remaining,
        paid_interview_remaining: quota.paid_interview_remaining,
      },
      checks: {
        chat: chatCheck,
        resume: resumeCheck,
        interview: interviewCheck,
      },
    });
  } catch (err) {
    console.error('quota check error:', err);
    return NextResponse.json({ ok: false, error: '服务器错误' }, { status: 500 });
  }
}
