/**
 * 面试复盘 - 会话管理 API
 * POST /api/interview-review/session — 创建会话
 * GET  /api/interview-review/session?id=xxx — 获取单场详情
 * DELETE /api/interview-review/session?id=xxx — 删除单场
 */
import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  createReviewSession,
  getReviewSession,
  deleteReviewSession,
} from "@/lib/interview-review/db";

export const runtime = "nodejs";

/** 创建复盘会话 */
export async function POST(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const body = await req.json();
    const { company, round, interview_time, tags, resume_text } = body;

    const sessionId = await createReviewSession({
      userId: auth.id,
      company: company || "",
      round: round || "",
      interviewTime: interview_time || "",
      tags: Array.isArray(tags) ? tags : [],
      resumeSnapshot: resume_text || undefined,
    });

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: "创建会话失败，数据库不可用" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, session_id: sessionId });
  } catch (err) {
    console.error("Create review session error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

/** 获取单场详情 */
export async function GET(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "缺少 session id" },
        { status: 400 }
      );
    }

    const session = await getReviewSession(id, auth.id);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "会话不存在或无权访问" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, session });
  } catch (err) {
    console.error("Get review session error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

/** 删除单场 */
export async function DELETE(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "缺少 session id" },
        { status: 400 }
      );
    }

    const success = await deleteReviewSession(id, auth.id);
    if (!success) {
      return NextResponse.json(
        { ok: false, error: "删除失败" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete review session error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
