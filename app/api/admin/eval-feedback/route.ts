import { getDbClient } from "@/lib/db";
import { evalAdminAccess, evalJson as json } from "@/lib/coach-harness/eval-admin-http";
import { evalUuid, parseEvalFeedback, evalRunChangeIds, feedbackHash, feedbackView } from "@/lib/coach-harness/eval-feedback";
export const runtime = "nodejs";
const fields = "id,run_id,resume_trace_id,change_id,scope,category,verdict,note,expected,status,created_at";
export async function GET(request: Request) {
  const {error} = await evalAdminAccess(); if (error) return error;
  const runId = new URL(request.url).searchParams.get("runId");
  if (runId && !evalUuid(runId)) return json({error:"运行编号无效"},400);
  try {
    const db = await getDbClient(); if (!db) throw Error("unavailable");
    let query = db.from("coach_eval_feedback").select(fields).order("created_at",{ascending:false}).limit(100);
    if (runId) query = query.eq("run_id",runId);
    const result = await query; if (result.error) throw result.error;
    return json({ok:true,cases:(result.data || []).map(feedbackView)});
  } catch { return json({error:"案例反馈暂时无法读取，请重试"},503); }
}
export async function POST(request: Request) {
  const {user,error} = await evalAdminAccess(); if (error || !user) return error!;
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({error:"不允许跨站保存反馈"},403);
  let body;
  try {
    const raw = await request.text(); if (Buffer.byteLength(raw) > 55000) return json({error:"反馈过长"},413);
    body = parseEvalFeedback(JSON.parse(raw));
  } catch { return json({error:"反馈格式无效"},400); }
  if (!body) return json({error:"请填写反馈，选择真实修改或整稿；不支持传入用户资料"},400);
  try {
    const db = await getDbClient(); if (!db) throw Error("unavailable");
    const stored = await db.from("coach_eval_runs").select("id,user_id,legacy_trace_id,run").eq("id",body.runId).maybeSingle();
    if (stored.error) throw stored.error;
    if (!stored.data) return json({error:"正式运行记录不存在，未保存"},404);
    if (body.scope === "change" && !evalRunChangeIds(stored.data.run || {}).has(body.changeId!))
      return json({error:"这条修改不属于当前运行，请重新选择"},400);
    const hash = feedbackHash(body,user.id);
    const inserted = await db.from("coach_eval_feedback").insert({
      id:body.id,run_id:body.runId,actor_user_id:user.id,subject_user_id:stored.data.user_id,
      resume_trace_id:stored.data.legacy_trace_id,change_id:body.changeId,scope:body.scope,
      category:body.category,verdict:body.verdict,note:body.note,expected:body.expected,content_hash:hash,
    }).select(fields).single();
    if (!inserted.error && inserted.data) return json({ok:true,feedback:feedbackView(inserted.data),replayed:false});
    if (inserted.error?.code !== "23505") throw inserted.error || Error("not_persisted");
    const existing = await db.from("coach_eval_feedback").select(`${fields},content_hash`).eq("id",body.id).maybeSingle();
    if (existing.error || !existing.data) throw existing.error || Error("not_found");
    if (existing.data.content_hash !== hash) return json({error:"该反馈编号已用于其他内容，请新建一条反馈"},409);
    return json({ok:true,feedback:feedbackView(existing.data),replayed:true});
  } catch { return json({error:"后台未确认保存，内容请保留并重试"},503); }
}
