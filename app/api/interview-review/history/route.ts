/**
 * 面试复盘 - 历史记录 API
 * GET /api/interview-review/history — 分页查询历史列表
 * DELETE /api/interview-review/history — 清空所有历史
 */
import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getReviewHistory, deleteAllReviewSessions } from "@/lib/interview-review/db";

export const runtime = "nodejs";

/** 获取历史列表（支持筛选和分页） */
export async function GET(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    const { sessions, total } = await getReviewHistory({
      userId: auth.id,
      company: searchParams.get("company") || undefined,
      round: searchParams.get("round") || undefined,
      tag: searchParams.get("tag") || undefined,
      startDate: searchParams.get("start_date") || undefined,
      endDate: searchParams.get("end_date") || undefined,
      status: searchParams.get("status") || "analyzed",
      sort: (searchParams.get("sort") as "recent" | "grade") || "recent",
      page: parseInt(searchParams.get("page") || "1"),
      pageSize: parseInt(searchParams.get("page_size") || "20"),
    });

    // 列表页只返回摘要信息，不返回完整的 analysis_results 等大字段
    let list = sessions.map(s => ({
      id: s.id,
      company: s.company,
      round: s.round,
      interview_time: s.interview_time,
      tags: s.tags,
      question_count: s.parsed_questions?.length || 0,
      overall_grade: s.summary?.overall_grade || null,
      one_line_summary: s.summary?.one_line_summary || null,
      created_at: s.created_at,
    }));

    // 评级排序（客户端排序，因为 JSONB 字段不支持直接 ORDER BY）
    const sortParam = searchParams.get("sort") || "recent";
    if (sortParam === "grade") {
      const gradeOrder: Record<string, number> = {
        S: 0, "A+": 1, A: 2, "A-": 3, "B+": 4, B: 5, "B-": 6, "C+": 7, C: 8, D: 9,
      };
      list = list.sort((a, b) => {
        const ga = gradeOrder[a.overall_grade || ""] ?? 99;
        const gb = gradeOrder[b.overall_grade || ""] ?? 99;
        return ga - gb;
      });
    }

    return NextResponse.json({
      ok: true,
      list,
      total,
      page: parseInt(searchParams.get("page") || "1"),
      page_size: parseInt(searchParams.get("page_size") || "20"),
    });
  } catch (err) {
    console.error("Get review history error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

/** 清空所有历史 */
export async function DELETE(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const success = await deleteAllReviewSessions(auth.id);
    if (!success) {
      return NextResponse.json(
        { ok: false, error: "清空失败" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete all review history error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
