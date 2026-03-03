/**
 * 面试复盘 - 单个训练任务操作
 * PATCH  /api/interview-review/tasks/[id] — 更新状态
 * DELETE /api/interview-review/tasks/[id] — 删除任务
 */
import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { updateTaskStatus, deleteTrainingTask } from "@/lib/interview-review/db";

export const runtime = "nodejs";

// PATCH: 更新任务状态
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { status } = body;

    if (!status || !["pending", "completed"].includes(status)) {
      return NextResponse.json({ ok: false, error: "无效的状态" }, { status: 400 });
    }

    const ok = await updateTaskStatus(id, auth.id, status);
    return NextResponse.json({ ok });
  } catch (err) {
    console.error("Update task error:", err);
    return NextResponse.json({ ok: false, error: "更新失败" }, { status: 500 });
  }
}

// DELETE: 删除任务
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const { id } = await params;
    const ok = await deleteTrainingTask(id, auth.id);
    return NextResponse.json({ ok });
  } catch (err) {
    console.error("Delete task error:", err);
    return NextResponse.json({ ok: false, error: "删除失败" }, { status: 500 });
  }
}
