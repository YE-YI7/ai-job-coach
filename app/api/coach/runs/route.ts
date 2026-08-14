import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { createCoachRun, getContextBundleForUser } from "@/lib/coach-harness/repository";
import type { CoachActionType, CoachExecutor } from "@/lib/coach-harness";

export const runtime = "nodejs";
const tasks = new Set<CoachActionType>(["job_decision", "resume_workshop", "project_deep_dive", "mock_interview", "interview_review", "follow_up", "application_assist"]);
const executors = new Set<CoachExecutor>(["hosted_api", "personal_agent", "browser_extension"]);

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const body = await request.json();
    const task = body.task as CoachActionType;
    const executor = body.executor as CoachExecutor;
    const goal = String(body.goal || "").trim().slice(0, 1000);
    if (!tasks.has(task) || !executors.has(executor) || !goal) return NextResponse.json({ ok: false, error: "运行参数不完整" }, { status: 400 });
    const context = await getContextBundleForUser({ userId: user.id, task, opportunityId: body.opportunityId });
    const run = await createCoachRun({ userId: user.id, opportunityId: body.opportunityId, task, executor, goal, payload: body.input, context, requiresConfirmation: Boolean(body.requiresConfirmation) });
    return NextResponse.json({ ok: true, run }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "运行创建失败" }, { status: 500 });
  }
}
