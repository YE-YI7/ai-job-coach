/**
 * GET /api/resume/latest
 * 获取当前用户最新的简历数据（用于面试个性化出题）
 */

export const runtime = "nodejs";

import { getCurrentUserFromRequest } from "@/lib/auth";
import { getLatestResumeByUserId } from "@/lib/db";

export async function GET() {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return new Response(
        JSON.stringify({ ok: false, error: "未认证" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const resume = await getLatestResumeByUserId(auth.id);

    if (!resume) {
      return new Response(
        JSON.stringify({ ok: true, data: null }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          id: resume.id,
          parsed: resume.parsed,
          filename: resume.filename,
          created_at: resume.created_at,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("获取最新简历失败:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "服务器内部错误",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
