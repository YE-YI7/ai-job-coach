import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getContextBundleForUser } from "@/lib/coach-harness/repository";
import type { CoachActionType } from "@/lib/coach-harness";

export const runtime = "nodejs";
const tasks = new Set<CoachActionType>(["job_decision", "resume_workshop", "project_deep_dive", "mock_interview", "interview_review", "follow_up", "application_assist"]);

export async function GET(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  const url = new URL(request.url);
  const task = url.searchParams.get("task") as CoachActionType;
  if (!tasks.has(task)) return NextResponse.json({ ok: false, error: "无效任务" }, { status: 400 });
  try {
    const context = await getContextBundleForUser({ userId: user.id, task, opportunityId: url.searchParams.get("opportunity_id") });
    return NextResponse.json({ ok: true, context });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "上下文生成失败" }, { status: 500 });
  }
}
