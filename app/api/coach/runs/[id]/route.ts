import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { assertUuid } from "@/lib/coach-harness/repository";
import { cancelTask } from "@/lib/coach-harness/run-ledger";

export const runtime = "nodejs";

/**
 * 按 id 收口一个任务（FR-35 的取消入口）。本轮只开通 `cancel`：
 * 状态机里取消由 `cancelTask` 负责（saving 窗口没有 →cancelled 这条合法迁移，
 * 它按「保留已完成步骤 + 记 outcome=cancelled」折算），这里不加第二条判定。
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (body.action !== "cancel") {
    return NextResponse.json({ ok: false, error: "目前只支持 action=cancel" }, { status: 400 });
  }
  try {
    const outcome = await cancelTask({ userId: user.id, runId: assertUuid(id, "runId"), reason: "user_cancelled" });
    return NextResponse.json({ ok: true, runId: id, ...outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("无效")) return NextResponse.json({ ok: false, error: message }, { status: 400 });
    if (message.includes("不存在")) return NextResponse.json({ ok: false, error: "任务不存在" }, { status: 404 });
    return NextResponse.json({ ok: false, error: "取消没有保存到云端，任务状态保留原样" }, { status: 500 });
  }
}
