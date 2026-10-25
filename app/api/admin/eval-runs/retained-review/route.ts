import { createHash } from 'node:crypto';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDbClient } from '@/lib/db';
import { isEvalAdmin } from '@/lib/coach-harness/eval-access';
import { observedResumeLLM, withEvalObserver, redactEval, type EvalSpan } from '@/lib/coach-harness/eval-observer';
import { runWithGenerationContext } from '@/lib/generation-context';
import { hasActiveTokenPayConnection } from '@/lib/tokenpay';
import { retainedResumeEvalInput } from '@/lib/coach-harness/resume-retained-eval';
import { RESUME_EDITORIAL_STANDARD } from '@/lib/coach-harness/resume-edit-value';
import { WHOLE_DOCUMENT_REVIEW_PROMPT, readDocumentReview } from '@/lib/coach-harness/resume-document-review';
import { RESUME_NARRATIVE_REVIEW_PROMPT, readResumeNarrativeReview, resumeContentDelta,
  unresolvedResumeEditorialGoals } from '@/lib/coach-harness/resume-editorial-plan';
import { resumeReviewSchema } from '@/lib/coach-harness/resume-review-schema';
import { resumeReviewProtocolIssue } from '@/lib/coach-harness/resume-review-diagnostic';

export const runtime = 'nodejs';
export const maxDuration = 90;
const json = (data: unknown, status = 200) => Response.json(data, { status,
  headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** One-shot review of an owned, failed DEIDENTIFIED sample. Never an edit or quota path. */
export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return json({ error: '请先登录' }, 401);
  if (!isEvalAdmin(user)) return json({ error: '需要管理员权限' }, 403);
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: '不允许跨站调用' }, 403);
  if (Date.now() >= Date.parse('2026-10-26T00:00:00Z')) return json({ error: '本轮只读验证窗口已结束' }, 410);
  let body: { sourceRunId: string; retainedChangeIds: string[]; acknowledgeCost: boolean };
  try {
    const raw = await request.text(); if (raw.length > 2000) return json({ error: '请求过大' }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body.sourceRunId !== 'string' || !uuid.test(body.sourceRunId) || body.acknowledgeCost !== true
      || Object.keys(body).some(key => !['sourceRunId', 'retainedChangeIds', 'acknowledgeCost'].includes(key))
      || !Array.isArray(body.retainedChangeIds) || body.retainedChangeIds.length < 1 || body.retainedChangeIds.length > 6
      || body.retainedChangeIds.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,180}$/.test(id))) throw Error();
  } catch { return json({ error: '仅接受原样本编号和已有修改编号，并确认一次模型计费' }, 400); }
  const db = await getDbClient(); if (!db) return json({ error: '存储不可用，未调用模型' }, 503);
  const parent = await db.from('coach_eval_runs').select('run').eq('id', body.sourceRunId).eq('user_id', user.id).maybeSingle();
  if (parent.error) return json({ error: '原记录不可读取，未调用模型' }, 503);
  const prepared = parent.data ? retainedResumeEvalInput(parent.data.run, body.retainedChangeIds) : null;
  if (!prepared) return json({ error: '不是本人的失败脱敏样本，或保留修改无法验证，未调用模型' }, 422);
  if (!await hasActiveTokenPayConnection(user.id)) return json({ error: '当前模型连接不可用，未切站点模型' }, 409);
  const digest = createHash('sha256').update(`retained-review/v1:${user.id}:${body.sourceRunId}`).digest('hex');
  const id = `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`;
  const started = Date.now(), spans: EvalSpan[] = [];
  const run: Record<string, unknown> = { id, label: '同一脱敏简历 · 保留稿单次独立复核',
    provenance: 'real_model_deidentified_retained_review', status: 'running', startedAt: new Date(started).toISOString(), spans,
    input: { sourceRunId: body.sourceRunId, retainedChangeIds: body.retainedChangeIds, maxModelCalls: 1 },
    limitations: ['不重跑编辑，只复核已有候选的保留稿；原失败记录不改为成功。',
      '每个原样本本版本只允许一次，不自动重试，不读原用户任务或预留益职额度。'] };
  const inserted = await db.from('coach_eval_runs').insert({ id, user_id: user.id, label: run.label, status: 'running', run });
  if (inserted.error) return inserted.error.code === '23505' ? json({ id, replayed: true }, 202)
    : json({ error: '存储失败，未调用模型' }, 503);
  const save = async () => {
    run.durationMs = Date.now() - started;
    const result = await db.from('coach_eval_runs').update({ run: redactEval(run), status: run.status }).eq('id', id).eq('user_id', user.id);
    if (result.error) throw Error('RETAINED_REVIEW_SAVE_FAILED');
  };
  try {
    const schema = resumeReviewSchema(prepared.changes, false, false, prepared.plan);
    const output = await withEvalObserver({ spans, save }, () => runWithGenerationContext({ userId: user.id,
      operation: 'resume_review', requestId: `${id}:retained-review` }, () => observedResumeLLM([
      { role: 'system', content: RESUME_EDITORIAL_STANDARD },
      { role: 'system', content: WHOLE_DOCUMENT_REVIEW_PROMPT + '\n' + RESUME_NARRATIVE_REVIEW_PROMPT },
      { role: 'user', content: JSON.stringify({ original: prepared.original, appliedCandidate: prepared.preview,
        jobDescription: prepared.jd, facts: prepared.facts, changes: prepared.changes,
        styleContract: prepared.styleContract, editorialPlan: prepared.plan }) },
      { role: 'system', content: `只检查，不改写。逐条对比实际删减与主次变化，不要求新增经历、数字或事实。
不能只因编辑自述有价值就放行；也不能因所保留事实原文已存在就否定精简。原目标已达成时给具体keep_original依据。
每条valueChecks恰好一次，reason至少8字。document.failed须有error，只有warning时不能填failed。无补问recovery=null。
唯一JSON Schema：${JSON.stringify(schema.schema)}` },
    ], { provider: 'deepseek', temperature: 0, maxTokens: 2200, reasoningBudgetTokens: 8192,
      timeoutMs: 55_000, maxRetries: 0, responseFormat: 'json_object', responseSchema: schema })));
    const review = JSON.parse(output.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
    const issue = resumeReviewProtocolIssue(review, prepared.changes, prepared.plan);
    if (issue) throw Error(issue);
    const documentReview = readDocumentReview(review.document, prepared.changes, 'independent');
    const narrativeReview = readResumeNarrativeReview(review.narrativeReview, prepared.plan);
    const unresolved = unresolvedResumeEditorialGoals(prepared.plan, narrativeReview, prepared.changes);
    const ok = review.status === 'passed' && review.valueChecks.every((check: { useful: boolean }) => check.useful)
      && !review.findings.some((finding: { severity: string }) => finding.severity === 'error')
      && !review.valueChecks.some((check: { index: number; impact: string }) => check.impact === 'content'
        && resumeContentDelta(prepared.changes[check.index].before, prepared.changes[check.index].after) !== 'body_changed')
      && documentReview.status === 'passed' && unresolved.length === 0;
    run.status = ok ? 'completed' : 'blocked';
    run.result = { status: run.status, output: ok ? prepared.preview : null,
      rawResponse: { ok, changes: prepared.changes, editorialPlan: prepared.plan, narrativeReview, documentReview,
        review, unaddressedGoalIds: unresolved.map(goal => goal.id), sourceRunId: body.sourceRunId } };
  } catch (error) {
    run.status = 'blocked'; run.result = { status: 'blocked', output: null,
      error: error instanceof Error ? error.message : '单次复核未完成，未追加调用' };
  }
  try { await save(); } catch { return json({ id, error: '保存尚未确认，不会重新调用模型' }, 503); }
  return json({ id, status: run.status, modelCalls: spans.length });
}
