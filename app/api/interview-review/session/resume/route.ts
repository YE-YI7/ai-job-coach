/**
 * 面试复盘 - 简历关联 API
 * PATCH /api/interview-review/session/resume — 关联/更新简历
 * GET /api/interview-review/session/resume — 获取用户简历列表
 */
import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { updateSessionResume } from "@/lib/interview-review/db";
import { getDbClient } from "@/lib/db";

export const runtime = "nodejs";

/** 关联简历到会话 */
export async function PATCH(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const body = await req.json();
    const { session_id, resume_text } = body;

    if (!session_id) {
      return NextResponse.json(
        { ok: false, error: "缺少 session_id" },
        { status: 400 }
      );
    }

    const success = await updateSessionResume(
      session_id,
      auth.id,
      resume_text || null
    );

    if (!success) {
      return NextResponse.json(
        { ok: false, error: "更新简历关联失败" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Update resume error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

/** 获取用户简历列表（用于面试复盘关联选择） */
export async function GET() {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const client = await getDbClient();
    if (!client) {
      return NextResponse.json({ ok: true, resumes: [] });
    }

    // 从 resumes 表获取用户的所有简历
    const { data, error } = await client
      .from("resumes")
      .select("id, filename, parsed, created_at")
      .eq("user_id", auth.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("获取简历列表失败:", error);
      return NextResponse.json({ ok: true, resumes: [] });
    }

    const resumes = (data || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      filename: (r.filename as string) || "未命名简历",
      summary: extractResumeSummary(r.parsed as Record<string, unknown> | null),
      created_at: r.created_at,
    }));

    return NextResponse.json({ ok: true, resumes });
  } catch (err) {
    console.error("Get resumes error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

/** 从解析数据中提取简历摘要 */
function extractResumeSummary(parsed: Record<string, unknown> | null): string {
  if (!parsed) return "";
  const basicInfo = parsed.basicInfo as Record<string, unknown> | undefined;
  const experience = parsed.experience as Array<Record<string, unknown>> | undefined;
  const name = (parsed.name as string) || (basicInfo?.name as string) || "";
  const title = (parsed.title as string) || (basicInfo?.title as string) || "";
  const company = (parsed.company as string) || (experience?.[0]?.company as string) || "";
  const parts = [name, title, company].filter(Boolean);
  return parts.join(" · ") || "简历内容";
}
