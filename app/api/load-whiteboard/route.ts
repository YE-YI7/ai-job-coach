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

  try {
    const db = await getDbClient();
    if (!db) {
      return NextResponse.json({ ok: true, data: {} });
    }

    const { data, error } = await db
      .from("whiteboard_states")
      .select("data")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error("load-whiteboard db error:", error);
      return NextResponse.json({ ok: true, data: {} });
    }

    return NextResponse.json({ ok: true, data: data?.data || {} });
  } catch (err) {
    console.error("load-whiteboard error:", err);
    return NextResponse.json({ ok: true, data: {} });
  }
}

