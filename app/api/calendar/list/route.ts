/**
 * 面试日历 - 获取面试列表
 * GET /api/calendar/list
 * 
 * 返回用户所有面试条目，按日期排序
 */

import { NextRequest, NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";

function getUserId(request: NextRequest): string | null {
  return request.cookies.get("sb-session-user-id")?.value || null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const client = await getDbClient();
    if (!client) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const { data, error } = await client
      .from("interview_calendar")
      .select("*")
      .eq("user_id", userId)
      .order("interview_date", { ascending: true });

    if (error) {
      console.error("获取面试日历失败:", error);
      return NextResponse.json({ error: "查询失败" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (err: any) {
    console.error("Calendar list error:", err);
    return NextResponse.json({ error: err.message || "服务器错误" }, { status: 500 });
  }
}
