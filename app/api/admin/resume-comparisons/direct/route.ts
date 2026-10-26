import {createHash, randomUUID} from 'node:crypto';
import {getDbClient} from '@/lib/db';
import {directComparisonModel} from '@/lib/direct-comparison-model';
import {evalAdminAccess, evalJson as json} from '@/lib/coach-harness/eval-admin-http';
import {COMPARISON_TYPE, DIRECT_TYPE, parseComparison, uuid} from '@/lib/coach-harness/resume-comparison';
import type {EvalSpan} from '@/lib/coach-harness/eval-scope';
import {isSameOriginRequest} from '@/lib/phone-auth/security';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  const {user, error} = await evalAdminAccess(); if (error || !user) return error!;
  if (!isSameOriginRequest(request)) return json({error: '不允许跨站调用'}, 403);
  let body;
  try {const raw = await request.text(); if (raw.length > 1000) return json({error: '参数过长'}, 413); body = JSON.parse(raw);}
  catch {return json({error: '请求无效'}, 400);}
  if (!uuid(body?.id) || body.acknowledgeCost !== true || process.env.LLM_STUB === '1')
    return json({error: '需确认供应商费用；模拟环境不能生成真实对照'}, 400);
  try {
    const db = await getDbClient(); if (!db) throw Error('unavailable');
    const source = await db.from('coach_eval_runs').select('run').eq('id', body.id).eq('user_id', user.id)
      .eq('run->>recordType', COMPARISON_TYPE).maybeSingle();
    if (source.error) throw source.error;
    const comparison = parseComparison(source.data?.run?.comparison);
    if (!comparison) return json({error: '对照不存在或不属于当前账号'}, 404);
    // Three one-shot slots, reserved durably before any upstream call. Concurrent clicks cannot exceed this ceiling.
    const attempts = await db.from('coach_eval_runs').select('id,status').eq('user_id', user.id)
      .eq('run->>recordType', DIRECT_TYPE).eq('run->>comparisonId', body.id);
    if (attempts.error) throw attempts.error;
    if ((attempts.data?.length || 0) >= 3) return json({error: '本对照已用完三次直调预算，不会自动重试'}, 409);
    if (attempts.data?.some((r: {status: string}) => r.status === 'running')) return json({error: '已有一次直调正在处理，请先刷新核对'}, 409);
    const slot = (attempts.data?.length || 0) + 1;
    const digest = createHash('sha256').update(`direct:${user.id}:${body.id}:${slot}`).digest('hex');
    const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    const traceId = randomUUID(), started = Date.now();
    const messages: Array<{role: 'system' | 'user'; content: string}> = [
      {role: 'system', content: [
        '你是简历编辑。根据给定原简历和目标JD，抓住候选人的主线与具体贡献，做有价值的取舍与结构调整，避免只换词；不得编造经历、数字或已上线能力。',
        '只返回JSON：sections与decisions。sections中每段的id、label与输入保持一致，但text是你编辑后的正文，可以重新写、精简或调整重点，不是要求保持原文。',
        '如果某段确实无需修改，可以保留原文，并在decisions说明。decisions写3至6条简短的编辑取舍摘要，不提供内部推理。保留必要事实和可核验链接。',
      ].join('')},
      {role: 'user', content: JSON.stringify({resume: comparison.input.resume, jd: comparison.input.jd,
        sections: comparison.columns[0].sections})},
    ];
    const span: EvalSpan = {id: randomUUID(), name: 'TokenDance 直接改稿（无改稿 Harness）',
      agent: 'TokenDance 直接改稿（无改稿 Harness）', kind: 'agent',
      status: 'running', startedAt: new Date(started).toISOString(), durationMs: 0, input: {messages,
        options: {model: comparison.model, provider: comparison.provider, maxTokens: 6500, temperature: 0.3, maxRetries: 0}},
      output: null, model: comparison.model, knowledge: []};
    const run = {schemaVersion: 'yizhi.eval/v1', id, recordType: DIRECT_TYPE, comparisonId: body.id, slot,
      traceId, status: 'running', protocolVersion: 'direct-rewrite-v2', model: comparison.model, provider: comparison.provider,
      label: '模型直改 · ' + comparison.title, startedAt: span.startedAt, spans: [span],
      result: {status: 'running', output: null as unknown}, sections: [] as unknown[], decisions: [] as string[],
      limitation: '只保留通用认证、传输与成本日志；未使用产品知识检索、编辑计划、独立质检和返修。完成不代表质量通过。'};
    const inserted = await db.from('coach_eval_runs').insert({id, user_id: user.id, label: run.label, status: 'running', run});
    if (inserted.error) return json({error: inserted.error.code === '23505' ? '这次调用已预留，请刷新核对，未重复发起' : '调用预留失败，未请求模型'},
      inserted.error.code === '23505' ? 409 : 503);
    try {
      const response = await directComparisonModel({userId: user.id, traceId, model: comparison.model, messages});
      const output = response.text;
      span.usage = response.usage;
      span.output = output;
      if (response.finishReason !== 'stop') throw Error('incomplete_output');
      const parsed = JSON.parse(output.replace(/^```(?:json)?\s*|\s*```$/g, ''));
      const ids = comparison.columns[0].sections.map(s => s.id);
      if (!Array.isArray(parsed.sections) || parsed.sections.length !== ids.length ||
        !parsed.sections.every((s: {id?: string; text?: string}, i: number) => s?.id === ids[i] &&
          typeof s.text === 'string' && s.text.length <= 50000) || !Array.isArray(parsed.decisions) ||
        parsed.decisions.length > 12 || !parsed.decisions.every((s: unknown) => typeof s === 'string' && s.length <= 2000))
        throw Error('invalid_output_shape');
      run.sections = comparison.columns[0].sections.map((s, i) => ({...s, text: parsed.sections[i].text}));
      run.decisions = parsed.decisions; run.status = 'completed'; span.status = 'completed';
      run.result = {status: 'completed', output: {sections: run.sections, decisions: run.decisions}};
    } catch {
      run.status = 'failed'; span.status = 'failed';
      run.result = {status: 'failed', output: '直调未完成或输出契约不完整。原始输出与Trace保留，不自动重试、不修改原稿。'};
    }
    span.durationMs = Date.now() - started;
    const saved = await db.from('coach_eval_runs').update({status: run.status, run}).eq('id', id)
      .eq('user_id', user.id).eq('run->>recordType', DIRECT_TYPE).select('id');
    if (saved.error || !saved.data?.length) return json({error: '模型调用已执行，但最终保存未确认；请按编号核对，不要重复调用', id, traceId}, 503);
    return json({id, traceId, status: run.status});
  } catch {return json({error: '直调准备失败，未确认结果；请刷新对照核对'}, 503);}
}
