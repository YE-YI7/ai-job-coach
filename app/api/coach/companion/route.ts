import { getCurrentUserFromRequest } from "@/lib/auth";
import { attachCompanionFeedback, companionLoopEnabled, listCompanionGoals, markCompanion, openCompanion, readCompanion, recoverCompanionFeedback, submitCompanion } from "@/lib/coach-harness/companion-store";
import { recordCompanionEvent } from "@/lib/coach-harness/companion-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function scopeOf(value: string | null) {
  if (!value || value === "none") return null;
  return uuid.test(value) ? value : undefined;
}

export async function GET(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return json({ ok: false, error: "未认证" }, 401);
  const url = new URL(request.url);
  const planId = url.searchParams.get("planId") || undefined;
  const opportunityId = scopeOf(url.searchParams.get("opportunityId"));
  if (planId && !uuid.test(planId)) return json({ ok: false, error: "安排编号无效" }, 400);
  if (opportunityId === undefined) return json({ ok: false, error: "岗位编号无效" }, 400);
  try {
    const current = await readCompanion(user.id, planId, opportunityId);
    const goals = await listCompanionGoals(user.id, current?.companion.opportunityId ?? opportunityId);
    return json({ ok: true, enabled: companionLoopEnabled(), plan: current ? { id: current.plan.id, version: current.plan.version, companion: current.companion } : null, earlier: goals.filter((item) => item.id !== current?.plan.id) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "读取失败" }, 503);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return json({ ok: false, error: "未认证" }, 401);
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "请先写一句当前问题" }, 400);
  if (!["open", "submit", "feedback", "recover", "presented", "start", "skip", "stuck", "end", "reopen"].includes(body.action)) return json({ ok: false, error: "操作无效" }, 400);
  if (typeof body.text === "string" && body.text.length > 3000) return json({ ok: false, error: "请控制在 3000 字以内，较长材料可分次提交" }, 400);
  if (body.planId && !uuid.test(body.planId)) return json({ ok: false, error: "安排编号无效" }, 400);
  if (body.creationId && !uuid.test(body.creationId)) return json({ ok: false, error: "创建编号无效" }, 400);
  if (body.action === "open" && body.planId && !Number.isInteger(body.expectedVersion)) return json({ ok: false, error: "请先读取当前安排版本" }, 400);
  if (body.action === "open" && !companionLoopEnabled()) return json({ ok: false, error: "新的陪伴入口暂未开放，已保存记录仍可查看" }, 403);
  const opportunityId = body.opportunityId == null || body.opportunityId === "" ? null : body.opportunityId;
  if (opportunityId !== null && !uuid.test(opportunityId)) return json({ ok: false, error: "岗位编号无效" }, 400);
  try {
    if (body.action === "presented") {
      const current = await readCompanion(user.id, body.planId);
      if (!current || current.plan.version !== body.expectedVersion) return json({ ok: false }, 409);
      await recordCompanionEvent(user.id, "companion_step_presented", { plan_id: current.plan.id, goal_key: current.companion.goalKey, version: current.plan.version, request_id: current.companion.mentorRequestId || null });
      return json({ ok: true });
    }
    if (body.action === "recover") {
      if (!uuid.test(body.planId || "")) return json({ ok: false, error: "安排编号无效" }, 400);
      const current = await recoverCompanionFeedback(user.id, body.planId);
      return json({ ok: true, planId: current.plan.id, version: current.plan.version, companion: current.companion });
    }
    if (body.planId && body.action !== "feedback") {
      const scope = await readCompanion(user.id, body.planId);
      if (!scope || (scope.plan.opportunityId ?? null) !== opportunityId) return json({ ok: false, error: "安排不属于当前工作区" }, 404);
    }
    if (body.action === "start" || body.action === "skip" || body.action === "stuck" || body.action === "end" || body.action === "reopen") {
      if (!uuid.test(body.planId || "") || !Number.isInteger(body.expectedVersion)) return json({ ok: false, error: "安排编号无效" }, 400);
      const action = body.action === "start" || body.action === "reopen" ? "in_progress" : body.action === "skip" ? "skipped" : body.action === "end" ? "ended" : "paused";
      const plan = await markCompanion(user.id, body.planId, body.expectedVersion, action, typeof body.text === "string" ? body.text : undefined);
      return json({ ok: true, planId: plan.id, version: plan.version, companion: plan.tasks.find((task) => task.companion)?.companion || null });
    }
    if (body.action === "feedback") {
      if (!uuid.test(body.planId || "") || !uuid.test(body.submissionId || "") || !uuid.test(body.requestId || "") || !Number.isInteger(body.expectedVersion) || typeof body.text !== "string" || !body.text.trim()) return json({ ok: false, error: "反馈编号无效" }, 400);
      const plan = await attachCompanionFeedback(user.id, body.planId, body.expectedVersion, body.submissionId, body.text.trim(), body.requestId);
      return json({ ok: true, planId: plan.id, version: plan.version, companion: plan.tasks.find((task) => task.companion)?.companion || null });
    }
    if (typeof body.text !== "string" || !body.text.trim()) return json({ ok: false, error: "请先写一句当前问题" }, 400);
    if (body.action === "submit") {
      if (!uuid.test(body.planId || "") || !uuid.test(body.submissionId || "") || !Number.isInteger(body.expectedVersion)) return json({ ok: false, error: "提交编号无效" }, 400);
      const plan = await submitCompanion(user.id, body.planId, body.expectedVersion, body.submissionId, body.text.trim());
      return json({ ok: true, planId: plan.id, version: plan.version, companion: plan.tasks.find((task) => task.companion)?.companion || null });
    }
    if (body.planId && body.expectedVersion !== undefined && !Number.isInteger(body.expectedVersion)) return json({ ok: false, error: "安排编号无效" }, 400);
    const opened = await openCompanion(user.id, body.text.trim(), uuid.test(body.planId || "") ? body.planId : undefined, Number.isInteger(body.expectedVersion) ? body.expectedVersion : undefined, opportunityId, body.newGoal === true, body.creationId);
    const current = opened.saved ? await readCompanion(user.id, opened.saved.id) : null;
    return json({ ok: true, decision: opened.decision, saved: opened.saved, companion: current?.companion, model: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "没有保存";
    if (body.action === "feedback" && user) await recordCompanionEvent(user.id, "companion_feedback_failed", { plan_id: typeof body.planId === "string" ? body.planId : null, submission_id: typeof body.submissionId === "string" ? body.submissionId : null, reason_code: "unverified_feedback" });
    return json({ ok: false, error: message }, /没有这份|没有这次/.test(message) ? 404 : /刷新|不同|不能换|不是已保存/.test(message) ? 409 : 503);
  }
}
