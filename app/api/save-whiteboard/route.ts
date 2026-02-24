import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";

// 必须使用 Node.js runtime（因为需要数据库操作）
export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await getCurrentUserFromRequest();
  if (!auth) {
    return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  }
  const user = { id: auth.id, email: auth.email };

  const { data } = await req.json();

  if (!data) {
    return NextResponse.json({ ok: false, error: "data 字段缺失" }, { status: 400 });
  }

  // 阻止前端提交 key
  if (data?.apiKey || data?.key || data?.token) {
    return NextResponse.json(
      { ok: false, error: "Client is not allowed to send LLM keys." },
      { status: 400 }
    );
  }

  try {
    const db = await getDbClient();
    if (!db) {
      return NextResponse.json({ ok: false, error: "Database not initialized" }, { status: 500 });
    }

    await db.from("whiteboard_states").upsert({
      user_id: user.id,
      data,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("save-whiteboard error:", err);
    return NextResponse.json({ ok: false, error: "服务器内部错误" }, { status: 500 });
  }
}

