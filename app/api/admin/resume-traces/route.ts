import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { RESUME_TRACE_EVENT, resumeRequestHash } from "@/lib/coach-harness/resume-trace";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401, headers });
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map(item => item.trim().toLowerCase()).filter(Boolean);
  if (!user.email || !admins.includes(user.email.toLowerCase())) return NextResponse.json({ ok: false, error: "无管理员权限" }, { status: 403, headers });
  const params = new URL(request.url).searchParams;
  const requestId = params.get("requestId");
  const count = Number(params.get("limit") || 20);
  if (!Number.isInteger(count) || count < 1 || count > 50 || (requestId && requestId.length > 180)) return NextResponse.json({ ok: false, error: "查询参数无效" }, { status: 400, headers });
  try {
    const db = await getDbClient();
    if (!db) throw Error("unavailable");
    let query = db.from("product_events").select("id,occurred_at,properties").eq("event_name", RESUME_TRACE_EVENT);
    if (requestId) query = query.eq("properties->>requestHash", resumeRequestHash(requestId));
    const { data, error } = await query.order("occurred_at", { ascending: false }).limit(count);
    if (error) throw error;
    return NextResponse.json({ ok: true, traces: data || [] }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "暂时无法读取 Trace" }, { status: 503, headers });
  }
}
