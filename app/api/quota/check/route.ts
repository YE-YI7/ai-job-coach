import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { checkQuota, getOrCreateQuota } from '@/lib/quota';
import { getDbClient } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET /api/quota/check
 * 检查用户当前额度
 */
export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 });
    }

    const quota = await getOrCreateQuota(userId);
    let chatCheck = await checkQuota(userId, 'chat');
    const sessionId = new URL(request.url).searchParams.get('sessionId');
    // Read-only preflight must preserve the bounded first-coaching allowance.
    // The reservation RPC remains the authoritative, atomic admission check.
    if (!chatCheck.allowed && sessionId && /^[a-f0-9-]{36}$/i.test(sessionId)) {
      const db = await getDbClient();
      if (!db) throw new Error('quota database unavailable');
      const {data: session,error: sessionError} = await db.from('coach_learning_sessions').select('id').eq('id',sessionId).eq('user_id',userId).eq('status','active').maybeSingle();
      if (sessionError) throw sessionError;
      if (session) {
        const {data: grant,error: grantError} = await db.from('coach_first_guidance').select('session_id,status,completed_replies').eq('user_id',userId).maybeSingle();
        if (grantError) throw grantError;
        const {data: turns,error: turnError} = await db.from('coach_agent_turns').select('session_id').eq('user_id',userId).limit(1);
        if (turnError) throw turnError;
        if ((!grant && !turns?.length) || (grant?.session_id===sessionId && grant.status!=='reserved' && grant.completed_replies<2)) {
          chatCheck = {allowed:true,remaining:2-(grant?.completed_replies||0),source:'free'};
        }
      }
    }
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
