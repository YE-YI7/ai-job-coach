import { createHash } from 'node:crypto';
import { getDbClient } from '@/lib/db';
import { callLLM } from '@/lib/llm';
import { getTokenPayCredential } from '@/lib/tokenpay';
import { runWithGenerationContext } from '@/lib/generation-context';
import { evalAdminAccess, evalJson as json } from '@/lib/coach-harness/eval-admin-http';
import { isSameOriginRequest } from '@/lib/phone-auth/security';
import { evidenceSource, runEvidenceComparison, EVIDENCE_CALL_LIMIT, EVIDENCE_SOURCE_TRACE,
  type EvidenceArm } from '@/lib/coach-harness/resume-evidence-runtime';
import { RESUME_EVIDENCE_HARNESS_VERSION, CURRENT_EVIDENCE_REQUEST } from '@/lib/coach-harness/resume-evidence-contract';
import type { EvalSpan } from '@/lib/coach-harness/eval-scope';

export const runtime = 'nodejs';
export const maxDuration = 300;
function trialId(userId: string, version: string, arm: EvidenceArm) {
  const d = createHash('sha256').update(`${userId}:${EVIDENCE_SOURCE_TRACE}:${version}:${arm}`).digest('hex');
  return `${d.slice(0, 8)}-${d.slice(8, 12)}-4${d.slice(13, 16)}-a${d.slice(17, 20)}-${d.slice(20, 32)}`;
}
export async function POST(request: Request) {
  const {user, error} = await evalAdminAccess(); if (error || !user) return error!;
  if (!isSameOriginRequest(request)) return json({error: '不允许跨站调用'}, 403);
  let body: {sourceTraceId?: string; arm?: EvidenceArm; acknowledgeCost?: boolean; recoverConnection?: boolean};
  try {const raw = await request.text(); if (raw.length > 500) return json({error: '参数过长'}, 413); body = JSON.parse(raw);}
  catch {return json({error: '参数无效'}, 400);}
  if (!body || body.sourceTraceId !== EVIDENCE_SOURCE_TRACE || !['with_memory', 'without_memory'].includes(String(body.arm))
    || body.acknowledgeCost !== true || (body.recoverConnection !== undefined && body.recoverConnection !== true)
    || (body.recoverConnection && body.arm !== 'without_memory')
    || Object.keys(body).some(key => !['sourceTraceId', 'arm', 'acknowledgeCost', 'recoverConnection'].includes(key))) {
    return json({error: '只允许本次冻结样本的两臂；需要确认TokenDance费用'}, 400);
  }
  if (process.env.LLM_STUB === '1') return json({error: '模拟环境不能标记真实验收'}, 409);
  // This consent is one bounded pair, not a permanent public free-model endpoint.
  if (Date.now() >= Date.parse('2026-11-04T00:00:00Z')) return json({error: '本轮实验调用窗口已结束；历史结果仍可读取'}, 410);
  try {
    const db = await getDbClient(); if (!db) throw Error('unavailable');
    const original = await db.from('coach_eval_runs').select('run').eq('id', EVIDENCE_SOURCE_TRACE).eq('user_id', user.id).maybeSingle();
    if (original.error) throw original.error;
    if (!original.data) return json({error: '原样本不属于当前账号'}, 404);
    const source = evidenceSource(original.data.run, user.id);
    const originalRequest = source.payload.contract.request;
    source.payload.contract = {...source.payload.contract, request: CURRENT_EVIDENCE_REQUEST};
    if (body.arm === 'with_memory') {
      // Only the deterministic proof validator changed after M07.1. Exact private replay proves
      // the completed Memory arm's requests/tools/output unchanged; reuse it, never charge again.
      const prior = await db.from('coach_eval_runs').select('run').eq('user_id', user.id)
        .eq('id', '24eaa04c-76bd-43bb-aa86-6161094a5422').maybeSingle();
      if (prior.error) throw prior.error;
      const r = prior.data?.run;
      const same = r?.status === 'completed' && r.model === 'deepseek-v4-flash'
        && r.provider === 'tokendance' && r.harnessVersion === 'resume-evidence-harness/M07.1'
        && r.input?.arm === 'with_memory' && r.input.sourceHash === source.sourceHash
        && r.input.boundaryHash === source.boundaryHash && r.input.knowledgeHash === source.knowledgeHash
        && r.input.requestHash === createHash('sha256').update(CURRENT_EVIDENCE_REQUEST).digest('hex')
        && r.result?.rawResponse?.loadedFacts?.length > 0;
      if (same) return json({id: r.id, status: 'completed', calls: r.spans.length,
        saved: true, delivered: false, reused: true, newCalls: 0});
      return json({error: '已通过Memory臂的冻结条件不一致，不重复调用或静默替换'}, 409);
    }
    if (!await getTokenPayCredential(user.id)) return json({error: '现有TokenDance连接不可用，不切换供应商'}, 409);
    const originalId = trialId(user.id, RESUME_EVIDENCE_HARNESS_VERSION, body.arm!);
    if (body.recoverConnection) {
      const failed = await db.from('coach_eval_runs').select('run').eq('id', originalId).eq('user_id', user.id).maybeSingle();
      if (failed.error) throw failed.error;
      const r = failed.data?.run, span = r?.spans?.[0];
      const eligible = r?.status === 'failed' && r.model === 'deepseek-v4-flash' && r.provider === 'tokendance'
        && r.harnessVersion === RESUME_EVIDENCE_HARNESS_VERSION && r.input?.arm === 'without_memory'
        && r.input?.sourceHash === source.sourceHash
        && r.input?.boundaryHash === source.boundaryHash && r.input?.knowledgeHash === source.knowledgeHash
        && r.input?.requestHash === createHash('sha256').update(CURRENT_EVIDENCE_REQUEST).digest('hex')
        && r.spans.length === 1 && !span.output && !span.usage && r.metrics?.reportedTokenCalls === 0
        && span.transport?.phase === 'connecting'
        && span.transport?.nativeErrorCodes?.includes('UND_ERR_CONNECT_TIMEOUT');
      if (!eligible) return json({error: '仅允许上次无输出连接超时的一次显式补验；旧记录不清除'}, 409);
    }
    const id = body.recoverConnection ? trialId(user.id, RESUME_EVIDENCE_HARNESS_VERSION + '/connect-recovery-1', body.arm!) : originalId;
    const started = Date.now(), spans: EvalSpan[] = [];
    const run: Record<string, unknown> = {schemaVersion: 'yizhi.eval/v1', id, recordType: 'resume_harness_trial',
      executionScope: 'isolated_admin_eval_no_domain_writes', label: `M07.2 · 无Memory补验`,
      harnessVersion: RESUME_EVIDENCE_HARNESS_VERSION, sourceTraceId: EVIDENCE_SOURCE_TRACE,
      model: 'deepseek-v4-flash', provider: 'tokendance', startedAt: new Date(started).toISOString(), status: 'running',
      ...(body.recoverConnection ? {recoveryOf: originalId, executionProvenance: 'explicit_single_recovery_same_vercel_route'} : {}),
      input: {arm: body.arm, sourceTraceId: EVIDENCE_SOURCE_TRACE, sourceHash: source.sourceHash,
        boundaryHash: source.boundaryHash, knowledgeHash: source.knowledgeHash, maxCalls: EVIDENCE_CALL_LIMIT,
        source: source.payload.source, request: source.payload.contract.request,
        originalRequest, requestHash: createHash('sha256').update(CURRENT_EVIDENCE_REQUEST).digest('hex'),
        goalVersion: 'current-contribution-objective/v1',
        boundaryVersion: 'resume-boundary/v0.7.0-B05', memorySnapshot: source.snapshot},
      spans, result: {status: 'running', output: null}, evaluation: null, evaluationStatus: 'not_requested'};
    const inserted = await db.from('coach_eval_runs').insert({id, user_id: user.id, label: run.label, status: 'running', run});
    if (inserted.error) return json({id, error: inserted.error.code === '23505'
      ? '本臂已预留或执行，请按编号读回，不重复调用' : '预留失败，未调用模型'}, inserted.error.code === '23505' ? 409 : 503);
    const save = async () => {
      run.durationMs = Date.now() - started;
      const saved = await db.from('coach_eval_runs').update({status: run.status, run}).eq('id', id).eq('user_id', user.id).select('id');
      if (saved.error || !saved.data?.length) throw Error('CHECKPOINT_NOT_SAVED');
    };
    try {
      const result = await runEvidenceComparison({source, arm: body.arm!, runId: id, spans, checkpoint: save,
        invoke: async (messages, phase, sequence, nativeTools) => {
          let usage: (NonNullable<EvalSpan['usage']> & {model: string}) | undefined;
          const text = await runWithGenerationContext({userId: user.id, operation: 'admin_resume_harness_comparison',
            requestId: `${id}:${sequence}:${phase}`}, () => callLLM(messages, {provider: 'tokendance', model: 'deepseek-v4-flash',
            requireExactConnectedModel: true, temperature: 0.15, maxTokens: phase === 'review' ? 4200 : 3400, maxRetries: 0,
            ...(nativeTools ? {nativeTools} : {}),
            timeoutMs: 65000, firstTokenTimeoutMs: 30000, thinking: 'disabled', responseFormat: 'json_object',
            onDiagnostic: diagnostic => {const span = spans.at(-1); if (span) span.transport = diagnostic;},
            onUsage: value => {usage = {...value, cacheHitTokens: value.cacheHitTokens ?? null,
              estimatedCostUsd: value.estimatedCostUsd ?? null, pricingVersion: value.pricingVersion ?? null,
              provider: value.provider ?? null, retryCount: value.retryCount ?? null};
              const span = spans.at(-1); if (span) span.usage = usage;}}));
          if (!usage || usage.provider !== 'tokendance' || usage.model !== 'deepseek-v4-flash') throw Error('FROZEN_MODEL_OR_USAGE_MISSING');
          return {text, usage};
        }});
      run.status = result.status;
      run.result = {status: result.status, output: result.draft, rawResponse: {...result, notDelivered: true}};
    } catch (error) {
      run.status = 'failed'; run.result = {status: 'failed', output: null, notDelivered: true,
        reason: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'EXPERIMENT_EXECUTION_FAILED'};
    }
    const allReported = spans.length > 0 && spans.every(s => s.usage != null);
    run.metrics = {calls: spans.length, reportedTokenCalls: spans.filter(s => s.usage != null).length,
      inputTokens: allReported ? spans.reduce((n, s) => n + s.usage!.inputTokens, 0) : null,
      outputTokens: allReported ? spans.reduce((n, s) => n + s.usage!.outputTokens, 0) : null,
      referenceUsd: spans.every(s => s.usage?.estimatedCostUsd != null)
        ? spans.reduce((n, s) => n + s.usage!.estimatedCostUsd!, 0) : null};
    try {await save();} catch {return json({id, error: '模型可能已执行，保存未确认；不要重复调用'}, 503);}
    return json({id, status: run.status, calls: spans.length, saved: true, delivered: false});
  } catch {return json({error: '准备失败；未获确认的结果不自动重试'}, 503);}
}
