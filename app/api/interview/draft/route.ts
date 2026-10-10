import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { saveInterviewDraft } from "@/lib/interview/answer-draft";

export const runtime = "nodejs";
export const preferredRegion = "iad1";

async function handle(request: Request) {
  try {
    const user = await getCurrentUserFromRequest();
    if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
    const body = request.method === "GET" ? Object.fromEntries(new URL(request.url).searchParams) : await request.json();
    const { sessionId, questionId } = body;
    if (typeof sessionId !== "string" || typeof questionId !== "string" || !sessionId || !questionId) return NextResponse.json({ ok: false, error: "面试会话或题目无效" }, { status: 400 });
    const db = await getDbClient();
    if (!db) throw new Error("保存服务暂时不可用");
    const { data: session, error: sessionError } = await db.from("interview_sessions").select("id,opportunity_id").eq("id", sessionId).eq("user_id", user.id).maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) return NextResponse.json({ ok: false, error: "面试会话不可访问" }, { status: 404 });
    const { data: question, error: questionError } = await db.from("interview_questions").select("id").eq("id", questionId).eq("session_id", sessionId).maybeSingle();
    if (questionError) throw questionError;
    if (!question) return NextResponse.json({ ok: false, error: "题目不可访问" }, { status: 404 });
    if (request.method === "POST") {
      if (typeof body.answer !== "string" || !body.answer.trim() || body.answer.length > 30_000) return NextResponse.json({ ok: false, error: "请填写 1–30000 字回答" }, { status: 400 });
      await saveInterviewDraft({ userId: user.id, sessionId, questionId, opportunityId: session.opportunity_id }, body.answer.trim());
      return NextResponse.json({ ok: true, saved: true });
    }
    const { data, error } = await db.from("coach_sources").select("content,metadata").eq("user_id", user.id).eq("source_type", "user_answer")
      .eq("metadata->>kind", "interview_pending_answer").eq("metadata->>sessionId", sessionId).eq("metadata->>questionId", questionId).order("captured_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (data?.content) {
      const saved = await db.from("interview_answers").select("answer,assessment").eq("session_id",sessionId).eq("question_id",questionId).eq("answer",data.content).order("created_at",{ascending:false}).limit(1).maybeSingle();
      if(saved.error)throw saved.error;
      if(saved.data?.assessment) return NextResponse.json({ok:true,answer:null,completedAnswer:saved.data.answer,assessment:saved.data.assessment},{headers:{"Cache-Control":"no-store"}});
    }
    return NextResponse.json({ ok: true, answer: data?.metadata?.status === "pending" ? data.content : null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "回答保存或恢复失败，请保留原文后重试" }, { status: 503 });
  }
}
export const POST = handle;
export const GET = handle;
