/**
 * 面试日历 - 删除面试条目
 * DELETE /api/calendar/delete
 */

import { NextRequest, NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "缺少 id 参数" }, { status: 400 });
    }

    const client = await getDbClient();
    if (!client) {
      return NextResponse.json({ error: "数据库不可用" }, { status: 500 });
    }

    const { error } = await client
      .from("interview_calendar")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("删除面试日历失败:", error);
      return NextResponse.json({ error: "删除失败" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Calendar delete error:", err);
    return NextResponse.json({ error: err.message || "服务器错误" }, { status: 500 });
  }
}
