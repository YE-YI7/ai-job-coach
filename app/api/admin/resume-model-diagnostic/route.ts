import { createHash } from 'node:crypto';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDbClient } from '@/lib/db';
import { isEvalAdmin } from '@/lib/coach-harness/eval-access';
import { observedResumeLLM, withEvalObserver, redactEval, type EvalSpan } from '@/lib/coach-harness/eval-observer';
import { resumeConversationLlmOptions } from '@/lib/coach-harness/resume-conversation-model';
import { parseResumeConversationDecision } from '@/lib/coach-harness/resume-conversation-decision';
import { runWithGenerationContext } from '@/lib/generation-context';
import type { ResumeConversationTurn } from '@/lib/coach-harness/resume-task-types';
import { getTokenPayCredential } from '@/lib/tokenpay';

export const runtime = 'nodejs';
export const maxDuration = 90;
// Case-specific support probe. Owner consent: TWO calls total; no arbitrary
// input/model/user, no retries, no editor, no quota or business-table writes.
const SOURCE_TRACE = '35d45ca9-1737-4d9d-8f5d-8cfb7a41a631';
const SOURCE_SPAN = 'b0bb4f54-1bee-49ba-bc17-0d6694f4ee4e';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
type Kind = 'short' | 'mentor';
function probeId(userId: string, kind: Kind) {
  const hash = createHash('sha256').update(`resume-model-diagnostic:v1:${SOURCE_TRACE}:${userId}:${kind}`).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
async function access() {
  const user = await getCurrentUserFromRequest();
  if (!user) return { error: json({ error: '请先登录' }, 401) };
  if (!isEvalAdmin(user)) return { error: json({ error: '需要管理员权限' }, 403) };
  const db = await getDbClient();
  if (!db) return { error: json({ error: '存储不可用，未调用模型' }, 503) };
  const source = await db.from('coach_eval_runs').select('run').eq('id', SOURCE_TRACE).eq('user_id', user.id).maybeSingle();
  if (source.error) return { error: json({ error: '原 Trace 无法读取' }, 503) };
  if (!source.data) return { error: json({ error: '仅允许原 Trace 所属账号诊断' }, 403) };
  return { user, db, source: source.data.run as Record<string, unknown> };
}
export async function GET() {
  const auth = await access();
  if (auth.error) return auth.error;
  const result = await auth.db!.from('coach_eval_runs').select('id,status,run').eq('user_id', auth.user!.id)
    .in('id', [probeId(auth.user!.id, 'short'), probeId(auth.user!.id, 'mentor')]);
  if (result.error) return json({ error: '诊断结果无法读取' }, 503);
  return json({ ok: true, sourceTraceId: SOURCE_TRACE, probes: result.data.map((item: { id: string; status: string; run: Record<string, unknown> & { spans?: EvalSpan[] } }) => ({
    id: item.id, status: item.status, result: item.run.result,
    transport: item.run.spans?.[0]?.transport || null, durationMs: item.run.durationMs,
  })) });
}
export async function POST(request: Request) {
  const auth = await access();
  if (auth.error) return auth.error;
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: '不允许跨站调用' }, 403);
  // Expired support routes cannot become a permanent billing bypass.
  if (Date.now() >= Date.parse('2026-10-23T00:00:00Z')) return json({ error: '本次诊断窗口已结束' }, 410);
  let body: { kind?: unknown; acknowledgeCost?: unknown };
  try { const raw = await request.text(); if (raw.length > 256) return json({ error: '请求过大' }, 413); body = JSON.parse(raw); }
  catch { return json({ error: '请求无效' }, 400); }
  if (!body || Array.isArray(body) || !['short','mentor'].includes(String(body.kind)) || body.acknowledgeCost !== true
    || Object.keys(body).some(key => !['kind','acknowledgeCost'].includes(key))) return json({ error: '需要确认两次只读诊断的模型计费' }, 400);
  const { db, user, source } = auth;
  if (!await getTokenPayCredential(user!.id)) return json({ error: '原模型连接不可用，未切换到站点模型' }, 409);
  const kind = body.kind as Kind, id = probeId(user!.id, kind), started = Date.now();
  const sourceSpans = Array.isArray(source!.spans) ? source!.spans as EvalSpan[] : [];
  const original = sourceSpans.find(span => span.id === SOURCE_SPAN);
  const captured = (original?.input as { messages?: Array<{ role: 'system'|'user'|'assistant'; content: string }> })?.messages;
  if (!captured || captured.length !== 2 || captured.some(message => typeof message.content !== 'string')
    || JSON.stringify(captured).length > 120_000) return json({ error: '原始导师输入不可用，未调用模型' }, 422);
  const messages = kind === 'short' ? [{ role: 'user' as const, content: '只返回 JSON：{"ok":true}' }] : captured;
  let payload: { resume: string; conversation: Array<{ id: string; user: string; tutor: string|null }> };
  try { payload = JSON.parse(captured[1].content); if (typeof payload.resume !== 'string' || !Array.isArray(payload.conversation)) throw Error(); }
  catch { return json({ error: '原始材料不完整，未调用模型' }, 422); }
  const spans: EvalSpan[] = [];
  const run: Record<string, unknown> = {
    id, label: `原账号模型链路 · ${kind === 'short' ? '短回复' : '原导师输入（只读）'}`,
    provenance: 'production', startedAt: new Date(started).toISOString(), status: 'running',
    input: { sourceTraceId: SOURCE_TRACE, sourceSpanId: SOURCE_SPAN, kind,
      inputSha256: createHash('sha256').update(JSON.stringify(messages)).digest('hex') },
    spans, knowledge: kind === 'mentor' ? original?.knowledge || [] : [],
    result: { status: 'running', output: null }, evaluation: null, evaluationStatus: 'not_requested',
    limitations: ['仅调用导师决策模型，不执行编辑；原 Trace 的输入原样复用（保留既有凭据脱敏）。',
      '短回复与原导师输入各最多一次；相同探针重复提交不会重新调用模型。', '不预留、兑换或扣减益职积分；外部模型按真实请求计费。'],
  };
  const inserted = await db!.from('coach_eval_runs').insert({ id, user_id: user!.id, label: run.label, status: 'running', run });
  if (inserted.error) return inserted.error.code === '23505'
    ? json({ id, replayed: true, status: 'existing' }, 202) : json({ error: '诊断存储失败，未调用模型' }, 503);
  const save = async () => {
    run.durationMs = Date.now() - started;
    const result = await db!.from('coach_eval_runs').update({ run: redactEval(run), status: run.status, updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', user!.id);
    if (result.error) throw Error('DIAGNOSTIC_SAVE_FAILED');
  };
  try {
    const options = resumeConversationLlmOptions();
    if (kind === 'short') options.maxTokens = 32;
    const output = await withEvalObserver({ spans, save }, () => runWithGenerationContext({
      userId: user!.id, operation: 'resume_conversation', requestId: `${id}:diagnostic`,
      knowledgeDocumentIds: kind === 'mentor' ? (original?.knowledge || []).map(item => item.id) : [],
    }, () => observedResumeLLM(messages, options)));
    const parsed = kind === 'short' ? JSON.parse(output) : parseResumeConversationDecision(output, payload.resume,
      payload.conversation.map(turn => ({ id: turn.id, message: turn.user, reply: turn.tutor || '', status: 'completed', savedAt: '' } as ResumeConversationTurn)));
    if (kind === 'short' && parsed.ok !== true) throw Error('SHORT_REPLY_INVALID');
    run.status = 'completed';
    run.result = { status: 'completed', output: parsed, editorExecuted: false };
  } catch {
    run.status = 'failed';
    run.result = { status: 'failed', output: null, error: '模型或导师输出验证失败；查看 Agent Trace 的传输证据', editorExecuted: false };
  }
  try { await save(); } catch { return json({ id, error: '结果保存失败，不会自动重试模型' }, 503); }
  return json({ ok: run.status === 'completed', id, status: run.status, durationMs: run.durationMs, transport: spans[0]?.transport || null,
    decision: kind === 'mentor' && run.status === 'completed' ? (run.result as { output: { action: string } }).output.action : null });
}
