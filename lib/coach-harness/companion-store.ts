import { createHash } from "node:crypto";
import { getDbClient } from "@/lib/db";
import { getPlanById, getPlanHistory, updatePlanTasks, type CoachPlan, type PlanTask } from "./plans";
import { decideCompanion, shrinkStep, type CompanionTask } from "./companion-arrangement";
import { recordCompanionEvent } from "./companion-events";
import { companionBinding, companionVisibleText, type CompanionBinding, type CompanionReview } from "./companion-protocol";

export function companionGoalKey(title: string) {
  return createHash("sha256").update(title.trim()).digest("hex").slice(0, 16);
}

export function companionPayloadHash(text: string) {
  return createHash("sha256").update(text.trim()).digest("hex");
}

export function companionLoopEnabled() {
  if (process.env.COMPANION_LOOP === "0") return false;
  if (process.env.COMPANION_LOOP === "1") return true;
  return process.env.NODE_ENV !== "production";
}

function taskOf(plan: CoachPlan | null): { plan: CoachPlan; task: PlanTask; companion: CompanionTask } | null {
  const task = plan?.tasks.find((item) => item.companion);
  if (!plan || !task?.companion) return null;
  return { plan, task, companion: task.companion };
}

function sameScope(plan: CoachPlan, opportunityId: string | null) {
  return (plan.opportunityId ?? null) === opportunityId;
}

export async function readCompanion(userId: string, planId?: string, opportunityId: string | null = null) {
  if (planId) return taskOf(await getPlanById(userId, planId));
  const history = await getPlanHistory(userId, 20, { opportunityId, companionOnly: true });
  const plan = history.find((item) => sameScope(item, opportunityId) && item.tasks.some((task) => task.companion)) || null;
  return taskOf(plan);
}

export async function listCompanionGoals(userId: string, opportunityId: string | null) {
  const history = await getPlanHistory(userId, 20, { opportunityId, companionOnly: true });
  return history
    .filter((plan) => sameScope(plan, opportunityId) && plan.tasks.some((task) => task.companion))
    .slice(0, 6)
    .map((plan) => ({ id: plan.id, version: plan.version, goalTitle: plan.tasks.find((task) => task.companion)?.companion?.goalTitle || "已保存的目标" }));
}

export async function openCompanion(userId: string, text: string, expectedPlanId?: string, expectedVersion?: number, opportunityId: string | null = null, forceNew = false, creationId?: string) {
  if (creationId) {
    const replay = await readCompanion(userId, creationId);
    if (replay) {
      if (!sameScope(replay.plan, opportunityId) || replay.companion.sourceText !== text.trim()) throw Error("同一次创建不能换成另一段内容");
      return { decision: decideCompanion(text, replay.companion), saved: replay.plan };
    }
  }
  const current = forceNew ? null : await readCompanion(userId, expectedPlanId, opportunityId);
  if (expectedPlanId && !current) throw Error("没有这份安排");
  if (current && !sameScope(current.plan, opportunityId)) throw Error("安排不属于当前工作区");
  if (current && expectedVersion !== undefined && current.plan.version !== expectedVersion) throw Error("安排已更新，请刷新后重试");
  const decision = decideCompanion(text, current?.companion);
  if (decision.route !== "arrange" && decision.route !== "end") return { decision, saved: null };
  const goalKey = companionGoalKey(decision.goalTitle);
  // Explicitly correcting this plan keeps its identity and prior submissions.
  // Only the separate new-goal action starts another goal; title hashes are not IDs.
  const sameGoal = current && (Boolean(expectedPlanId) || current.companion.goalKey === goalKey);
  const companion: CompanionTask = {
    goalKey,
    goalTitle: decision.goalTitle,
    sourceText: text.trim(),
    weeklyHours: decision.weeklyHours,
    deadline: decision.deadline,
    answer: decision.answer,
    question: decision.question,
    step: decision.step,
    route: decision.route,
    stages: decision.stages,
    action: decision.route === "end" ? "ended" : sameGoal ? current.companion.action : "not_started",
    submissions: sameGoal ? current.companion.submissions : [],
    opportunityId,
    stuckNote: sameGoal ? current.companion.stuckNote ?? null : null,
    mentorRequestId: null,
    mentorFeedback: null,
  };
  const client = await getDbClient();
  if (!client) throw Error("数据库不可用");
  if (sameGoal) {
    const tasks = current.plan.tasks.map((item) => item.id === current.task.id ? { ...item, title: decision.step?.title || item.title, description: decision.step?.deliverable || item.description, reason: decision.step?.why || item.reason, companion } : item);
    const saved = await updatePlanTasks({ userId, planId: current.plan.id, tasks, reason: "修正当前安排", expectedVersion: current.plan.version });
    await recordCompanionEvent(userId, "companion_goal_saved", { plan_id: saved.id, goal_key: goalKey, version: saved.version, route: decision.route, opportunity_id: opportunityId });
    return { decision, saved };
  }
  const task: PlanTask = { id: `companion-${goalKey}`, title: decision.step?.title || decision.goalTitle, description: decision.step?.deliverable || decision.answer, status: "todo", reason: decision.step?.why || decision.answer, entryType: "learn_from_zero", companion };
  const { data, error } = await client.from("coach_plans").insert({ ...(creationId ? { id: creationId } : {}), user_id: userId, goal_type: "learn_from_zero", opportunity_id: opportunityId, status: "active", focused_at: new Date().toISOString(), tasks: [task], revision_reason: "从当前问题建立安排" }).select("*").single();
  if (error) throw error;
  const saved = { id: String(data.id), version: Number(data.version ?? 1) };
  await recordCompanionEvent(userId, "companion_goal_saved", { plan_id: saved.id, goal_key: goalKey, version: saved.version, route: decision.route, opportunity_id: opportunityId });
  return { decision, saved };
}

export async function markCompanion(userId: string, planId: string, expectedVersion: number, action: CompanionTask["action"], note?: string) {
  const current = await readCompanion(userId, planId);
  if (!current) throw Error("没有这份安排");
  if (current.plan.version !== expectedVersion) throw Error("安排已更新，请刷新后重试");
  const step = action === "paused" && current.companion.step ? shrinkStep(current.companion.step, note || current.companion.step.stuck) : current.companion.step;
  const companion: CompanionTask = { ...current.companion, action, step, stuckNote: action === "paused" ? (note || current.companion.stuckNote || null) : current.companion.stuckNote ?? null };
  const status = action === "skipped" || action === "ended" ? "skipped" as const : action === "in_progress" || action === "submitted" ? "in_progress" as const : "todo" as const;
  const tasks = current.plan.tasks.map((item) => item.id === current.task.id ? { ...item, status, title: step?.title || item.title, description: step?.deliverable || item.description, companion } : item);
  const saved = await updatePlanTasks({ userId, planId, tasks, reason: "更新当前一步状态", expectedVersion });
  await recordCompanionEvent(userId, "companion_task_marked", { plan_id: saved.id, goal_key: companion.goalKey, version: saved.version, route: companion.route, action });
  return saved;
}

export async function companionContext(userId: string, message: string, opportunityId: string | null) {
  const binding = companionBinding(message);
  if (!binding) {
    if (message.startsWith("<companion-request>")) throw Error("安排请求无效");
    return null;
  }
  if (!companionLoopEnabled()) throw Error("新的陪伴入口暂未开放，已保存记录仍可查看");
  const current = await readCompanion(userId, binding.planId);
  if (!current || !sameScope(current.plan, opportunityId)) throw Error("没有这份安排");
  if (current.plan.version !== binding.version) throw Error("安排已更新，请刷新后重试");
  const original = binding.submissionId ? current.companion.submissions.find(item => item.id === binding.submissionId)?.text : current.companion.sourceText;
  if (!original || original.trim() !== companionVisibleText(message).trim()) throw Error("安排的输入已变化，请重新读取");
  return { binding, task: current.companion };
}

export async function attachCompanionFeedback(userId: string, planId: string, expectedVersion: number, submissionId: string, feedback: string, requestId?: string) {
  const current = await readCompanion(userId, planId);
  if (!current) throw Error("没有这份安排");
  if (!requestId) throw Error("这不是已保存的导师回复");
  const client = await getDbClient();
  if (!client) throw Error("数据库不可用");
  const turn = await client.from("coach_agent_turns").select("id,question,answer,learning_trace,opportunity_id").eq("user_id", userId).eq("request_id", requestId).maybeSingle();
  if (turn.error) throw Error("暂时无法核对导师回复，请重试");
  const savedAnswer = typeof turn?.data?.answer === "string" ? turn.data.answer.trim() : "";
  const trace = turn.data?.learning_trace?.companion as (CompanionBinding & { review?: CompanionReview | null }) | undefined;
  const binding = companionBinding(turn.data?.question || "");
  if (!savedAnswer || savedAnswer !== feedback.trim() || !trace || !binding || trace.planId !== planId || trace.submissionId !== (submissionId || null) || trace.version !== binding.version || binding.planId !== planId || binding.submissionId !== trace.submissionId || !sameScope(current.plan, turn.data.opportunity_id ?? null)) throw Error("这不是已保存的导师回复");
  const previous = submissionId ? current.companion.submissions.find(item => item.id === submissionId) : null;
  if (submissionId && !previous) throw Error("没有这次提交");
  if (previous?.requestId === requestId || !submissionId && current.companion.mentorRequestId === requestId) return current.plan;
  if (previous?.feedback && previous.requestId !== requestId) return current.plan;
  // A late result can be kept with its original submission, never replace a newer task.
  const apply = current.plan.version === trace.version && expectedVersion === trace.version;
  if (!submissionId && !apply) return current.plan; // The old opening remains in its chat, not the corrected goal.
  const reviewNote = !apply ? "安排已变化，旧反馈已保留，未覆盖当前一步。" : !trace.review ? "回复已保存，下一步格式未通过校验，当前一步保持不变。" : null;
  const review = apply ? trace.review : null;
  const submissions = current.companion.submissions.map(item => item.id === submissionId ? { ...item, feedback: savedAnswer, review: "saved" as const, requestId, reviewNote } : item);
  const companion: CompanionTask = { ...current.companion, step: review?.step || current.companion.step, stages: review?.stages || current.companion.stages, action: review?.decision === "end" ? "ended" : review?.decision === "advance" ? "not_started" : current.companion.action, submissions, ...(!submissionId ? { mentorRequestId: requestId, mentorFeedback: savedAnswer, reviewNote } : {}) };
  const tasks = current.plan.tasks.map((item) => item.id === current.task.id ? { ...item, title: companion.step?.title || item.title, description: companion.step?.deliverable || item.description, reason: companion.step?.why || item.reason, status: companion.action === "ended" ? "skipped" as const : companion.action === "not_started" ? "todo" as const : item.status, companion } : item);
  const saved = await updatePlanTasks({ userId, planId, tasks, reason: "写回导师反馈", expectedVersion: current.plan.version });
  await recordCompanionEvent(userId, "companion_feedback_saved", { plan_id: saved.id, goal_key: companion.goalKey, version: saved.version, submission_id: submissionId, request_id: requestId });
  return saved;
}

/** Recover a confirmed reply without another model call or quota reservation. */
export async function recoverCompanionFeedback(userId: string, planId: string) {
  let current = await readCompanion(userId, planId);
  if (!current) throw Error("没有这份安排");
  const client = await getDbClient();
  if (!client) throw Error("数据库不可用");
  const { data, error } = await client.from("coach_agent_turns").select("request_id,answer,learning_trace").eq("user_id", userId).contains("learning_trace", { companion: { planId } }).order("created_at", { ascending: false }).limit(100);
  if (error) throw Error("暂时无法找回导师反馈");
  for (const turn of [...(data || [])].reverse()) {
    const trace = turn.learning_trace?.companion as CompanionBinding;
    const saved = await attachCompanionFeedback(userId, planId, trace.version, trace.submissionId || "", turn.answer, turn.request_id);
    current = taskOf(saved)!;
  }
  return current;
}

export async function submitCompanion(userId: string, planId: string, expectedVersion: number, submissionId: string, text: string) {
  const current = await readCompanion(userId, planId);
  if (!current) throw Error("没有这份安排");
  const payloadHash = companionPayloadHash(text);
  const existing = current.companion.submissions.find((item) => item.id === submissionId);
  if (existing) {
    if ((existing.payloadHash || companionPayloadHash(existing.text)) === payloadHash) return current.plan;
    throw Error("同一次提交不能换成另一段内容");
  }
  if (current.plan.version !== expectedVersion) throw Error("安排已更新，请刷新后重试");
  const companion: CompanionTask = { ...current.companion, action: "submitted", submissions: [...current.companion.submissions, { id: submissionId, text, savedAt: new Date().toISOString(), feedback: null, review: "none", payloadHash, requestId: null }] };
  const tasks = current.plan.tasks.map((item) => item.id === current.task.id ? { ...item, status: "in_progress" as const, companion } : item);
  const saved = await updatePlanTasks({ userId, planId, tasks, reason: "保存一次提交", expectedVersion });
  await recordCompanionEvent(userId, "companion_submission_saved", { plan_id: saved.id, goal_key: companion.goalKey, version: saved.version, submission_id: submissionId });
  return saved;
}
