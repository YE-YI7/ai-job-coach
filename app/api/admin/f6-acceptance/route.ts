import {evalAdminAccess, evalJson} from '@/lib/coach-harness/eval-admin-http';
import {isSameOriginRequest} from '@/lib/phone-auth/security';
import {claimF6Acceptance, F6_ACCEPTANCE_ID} from '@/lib/coach-harness/f6-acceptance';
import {runResumeDraft} from '@/lib/coach-harness/resume-execution';
import {F6_RESUME_WRITER} from '@/lib/coach-harness/resume-f6-writer';
import {withEvalObserver} from '@/lib/coach-harness/eval-scope';

export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(request: Request) {
  const {user, error} = await evalAdminAccess();
  if (error || !user) return error!;
  if (new URL(request.url).searchParams.get('verify') === 'runtime') {
    try { return evalJson(await (await import('@/lib/coach-harness/f6-runtime-verification')).verifyDeployedF6Runtime()); }
    catch (failure) { return evalJson({error: failure instanceof Error ? failure.message : '工具验证失败',modelCalls:0},503); }
  }
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>F6 隔离验收</title><h1>F6 原版完整运行环境验收</h1>
<p>原预算累计最多 ¥0.30 / 6 次，已用 3 次 / 上界估算 ¥0.110348。本次只用剩余额度，不扣个人钱包或积分。</p>
<p>使用失败记录的冻结输入，只保存到本次隔离副本。重复提交不会重复运行。</p>
<p><a href="?verify=runtime">零模型调用：检查候选服务器实际工具</a></p>
<form method="post"><input type="hidden" name="id" value="${F6_ACCEPTANCE_ID}">
<button type="submit">开始一次真实验收</button></form></html>`,
  {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store'}});
}
export async function POST(request: Request) {
  const {user, error} = await evalAdminAccess();
  if (error || !user) return error!;
  const isForm = request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded');
  // This endpoint deliberately exposes a native HTML form. The shared checker
  // additionally requires JSON for other endpoints; keep its origin/Host/fetch
  // checks intact while acknowledging this endpoint's second accepted encoding.
  const checkHeaders = new Headers(request.headers);
  if (isForm) checkHeaders.set('Content-Type', 'application/json');
  if (!isSameOriginRequest(new Request(request.url,{method:'POST',headers:checkHeaders}))) {
    return evalJson({error: '不允许跨站调用'}, 403);
  }
  const body = isForm
    ? Object.fromEntries(new URLSearchParams(await request.text())) : await request.json().catch(() => null);
  if (!body || body.id !== F6_ACCEPTANCE_ID || Object.keys(body).length !== 1) return evalJson({error: '仅允许本次验收'}, 400);
  let audit: Awaited<ReturnType<typeof claimF6Acceptance>> | undefined;
  try {
    const claimed = await claimF6Acceptance(user.id);
    audit = claimed;
    const response = await withEvalObserver(claimed, () => runResumeDraft(new Request(request.url, {
      method: 'POST', body: JSON.stringify(claimed.run.request),
    }), user, {writer: F6_RESUME_WRITER, maxDraftAttempts: 1, reviewPolicy: 'on_demand', acceptance: claimed.execution}));
    const output = await response.clone().json();
    audit.run.status = output.ok ? 'completed' : 'failed';
    audit.run.durationMs = Date.now() - Date.parse(audit.run.startedAt);
    audit.run.result = {status: audit.run.status, output, httpStatus: response.status};
    await audit.save();
    response.headers.set('x-yizhi-eval-id', F6_ACCEPTANCE_ID);
    return response;
  } catch (failure) {
    if (audit) {
      audit.run.status = 'failed';
      audit.run.durationMs = Date.now() - Date.parse(audit.run.startedAt);
      audit.run.result = {error: failure instanceof Error ? failure.message : 'ACCEPTANCE_FAILED'};
      await audit.save();
    }
    return evalJson({error: failure instanceof Error ? failure.message : '验收未完成', id: F6_ACCEPTANCE_ID}, 409);
  }
}
