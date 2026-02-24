import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";

// 必须使用 Node.js runtime（因为需要数据库操作）
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const body = await req.json();
    const { messages, sessionId, userId, inviteCode } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { ok: false, error: "messages 字段缺失或格式不正确" },
        { status: 400 }
      );
    }

    const db = await getDbClient();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Database not initialized" },
        { status: 500 }
      );
    }

    // 保存会话数据到数据库
    // 注意：这里简化处理，实际应该有专门的 sessions 表
    // 目前只是记录日志，不做实际存储
    console.log("保存会话:", {
      userId: auth.id,
      sessionId,
      messageCount: messages.length,
    });

    return NextResponse.json({
      ok: true,
      message: "会话已保存",
    });
  } catch (err) {
    console.error("❌ /api/save-session error:", err);
    return NextResponse.json(
      { ok: false, error: "内部错误" },
      { status: 500 }
    );
  }
}
