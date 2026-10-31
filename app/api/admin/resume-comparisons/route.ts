import {createHash} from 'node:crypto';
import {getDbClient} from '@/lib/db';
import {evalAdminAccess, evalJson as json} from '@/lib/coach-harness/eval-admin-http';
import {COMPARISON_TYPE, DRAFT_TYPE, DIRECT_TYPE, parseComparison, parseDraft, uuid} from '@/lib/coach-harness/resume-comparison';
import {isSameOriginRequest} from '@/lib/phone-auth/security';
export const runtime = 'nodejs';
function draftId(actor: string, comparison: string) {
  const s = createHash('sha256').update(`comparison-draft:${actor}:${comparison}`).digest('hex');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}
export async function GET(request: Request) {
  const {user, error} = await evalAdminAccess(); if (error || !user) return error!;
  const id = new URL(request.url).searchParams.get('id');
  if (id && !uuid(id)) return json({error: '对照编号无效'}, 400);
  try {
    const db = await getDbClient(); if (!db) throw Error('unavailable');
    if (!id) {
      const r = await db.from('coach_eval_runs').select('id,label,created_at').eq('user_id', user.id)
        .eq('run->>recordType', COMPARISON_TYPE).order('created_at', {ascending: false}).limit(30);
      if (r.error) throw r.error; return json({comparisons: r.data});
    }
    const r = await db.from('coach_eval_runs').select('run').eq('id', id).eq('user_id', user.id)
      .eq('run->>recordType', COMPARISON_TYPE).maybeSingle();
    if (r.error) throw r.error;
    const comparison = parseComparison(r.data?.run?.comparison);
    if (!comparison) return json({error: '对照不存在或不属于当前账号'}, 404);
    const [draft, direct] = await Promise.all([
      db.from('coach_eval_runs').select('run').eq('id', draftId(user.id, id)).eq('user_id', user.id)
        .eq('run->>recordType', DRAFT_TYPE).maybeSingle(),
      db.from('coach_eval_runs').select('id,status,created_at,run').eq('user_id', user.id)
        .eq('run->>recordType', DIRECT_TYPE).eq('run->>comparisonId', id).order('created_at', {ascending: true}).limit(10),
    ]);
    if (draft.error || direct.error) throw Error('read_failed');
    // Input is private administrator material, never a public static asset.
    return json({comparison, draft: draft.data?.run || null, directRuns: direct.data || []});
  } catch {return json({error: '对照暂时无法读取，请重试'}, 503);}
}
export async function POST(request: Request) {
  const {user, error} = await evalAdminAccess(); if (error || !user) return error!;
  if (!isSameOriginRequest(request)) return json({error: '不允许跨站存档'}, 403);
  let comparison;
  try {const raw = await request.text(); if (Buffer.byteLength(raw) > 600000) return json({error: '对照过大'}, 413);
    comparison = parseComparison(JSON.parse(raw));} catch {return json({error: '对照格式无效'}, 400);}
  if (!comparison) return json({error: '请核对来源列与对齐分段，最后一列由本人独立保存'}, 400);
  try {
    const db = await getDbClient(); if (!db) throw Error('unavailable');
    const saved = await db.from('coach_eval_runs').insert({id: comparison.id, user_id: user.id, label: comparison.title,
      status: 'completed', run: {recordType: COMPARISON_TYPE, comparison}});
    if (saved.error) return json({error: saved.error.code === '23505' ? '编号已存在，不覆盖旧证据' : '保存未确认'},
      saved.error.code === '23505' ? 409 : 503);
    return json({id: comparison.id, saved: true});
  } catch {return json({error: '保存未确认，请按原编号核对，不要立即重复创建'}, 503);}
}
export async function PATCH(request: Request) {
  const {user, error} = await evalAdminAccess(); if (error || !user) return error!;
  if (!isSameOriginRequest(request)) return json({error: '不允许跨站保存'}, 403);
  let body;
  try {const raw = await request.text(); if (Buffer.byteLength(raw) > 120000) return json({error: '手写稿过长'}, 413);
    body = JSON.parse(raw);} catch {return json({error: '手写稿格式无效'}, 400);}
  if (!uuid(body?.id) || !Number.isInteger(body.revision) || body.revision < 0 ||
    Object.keys(body).some(k => !['id', 'revision', 'sections'].includes(k))) return json({error: '保存参数无效'}, 400);
  try {
    const db = await getDbClient(); if (!db) throw Error('unavailable');
    const source = await db.from('coach_eval_runs').select('run').eq('id', body.id).eq('user_id', user.id)
      .eq('run->>recordType', COMPARISON_TYPE).maybeSingle();
    if (source.error) throw source.error;
    const comparison = parseComparison(source.data?.run?.comparison);
    if (!comparison) return json({error: '对照不存在或不属于当前账号'}, 404);
    const sections = parseDraft(body.sections, comparison.columns[0].sections.map(s => s.id));
    if (!sections) return json({error: '手写稿分段无效或过长，未保存'}, 400);
    const id = draftId(user.id, body.id), run = {recordType: DRAFT_TYPE, comparisonId: body.id,
      revision: body.revision + 1, sections, savedAt: new Date().toISOString()};
    const row = {user_id: user.id, label: '本人点评稿 · ' + comparison.title, status: 'completed', run};
    const result = body.revision === 0 ? await db.from('coach_eval_runs').insert({id, ...row}).select('id') :
      await db.from('coach_eval_runs').update({run}).eq('id', id).eq('user_id', user.id)
        .eq('run->>recordType', DRAFT_TYPE).eq('run->>revision', String(body.revision)).select('id');
    if (result.error?.code === '23505' || (!result.error && !result.data?.length))
      return json({error: '另一窗口已经保存了新版。当前输入未丢失，请先复制，再刷新核对。'}, 409);
    if (result.error) throw result.error;
    return json({saved: true, draft: run});
  } catch {return json({error: '后台尚未确认保存；当前输入保留，请按原版本重试'}, 503);}
}
