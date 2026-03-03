/**
 * 面试复盘 - 标签更新 API
 * PATCH /api/interview-review/session/tags — 更新会话标签
 */
import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { updateSessionTags, getUserTags } from "@/lib/interview-review/db";

export const runtime = "nodejs";

/** 更新会话标签 */
export async function PATCH(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const body = await req.json();
    const { session_id, tags } = body;

    if (!session_id) {
      return NextResponse.json(
        { ok: false, error: "缺少 session_id" },
        { status: 400 }
      );
    }

    if (!Array.isArray(tags)) {
      return NextResponse.json(
        { ok: false, error: "tags 必须是数组" },
        { status: 400 }
      );
    }

    const success = await updateSessionTags(session_id, auth.id, tags);
    if (!success) {
      return NextResponse.json(
        { ok: false, error: "更新标签失败" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, tags });
  } catch (err) {
    console.error("Update tags error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

/** 获取用户所有历史标签 */
export async function GET() {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const tags = await getUserTags(auth.id);
    return NextResponse.json({ ok: true, tags });
  } catch (err) {
    console.error("Get user tags error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
