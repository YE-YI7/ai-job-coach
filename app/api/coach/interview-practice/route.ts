import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { createOpportunitySnapshot } from "@/lib/coach-harness/repository";
import { evaluateQuickPractice } from "@/lib/interview/practice";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 });
  }

  const opportunityId = String(body.opportunityId || "").trim();
  const question = String(body.question || "").trim().slice(0, 2000);
  const answer = String(body.answer || "").trim().slice(0, 12_000);
  const jobDescription = String(body.jobDescription || "").trim().slice(0, 30_000);
  const resumeText = String(body.resumeText || "").trim().slice(0, 30_000);
  if (!opportunityId || !question || !answer) {
    return NextResponse.json({ ok: false, error: "请先完成回答" }, { status: 400 });
  }

  const db = await getDbClient();
  if (!db) return NextResponse.json({ ok: false, error: "数据库不可用" }, { status: 500 });
  const { data: opportunity, error: opportunityError } = await db.from("coach_opportunities")
    .select("id").eq("id", opportunityId).eq("user_id", user.id).maybeSingle();
  if (opportunityError) return NextResponse.json({ ok: false, error: "岗位校验失败" }, { status: 500 });
  if (!opportunity) return NextResponse.json({ ok: false, error: "岗位不存在" }, { status: 404 });

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const { count, error: countError } = await db.from("coach_opportunity_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("opportunity_id", opportunityId)
    .eq("snapshot_type", "interview_feedback")
    .contains("metadata", { mode: "quick_practice" })
    .gte("frozen_at", dayStart.toISOString());
  if (countError) return NextResponse.json({ ok: false, error: "练习记录校验失败" }, { status: 500 });
  if ((count || 0) >= 3) {
    return NextResponse.json({ ok: false, error: "今天的 3 次免费单题分析已用完，可继续使用模拟面试圆桌" }, { status: 429 });
  }

  const createdAt = new Date().toISOString();
  try {
    const analysis = await evaluateQuickPractice({ question, answer, jobDescription, resumeText });
    const record = { id: crypto.randomUUID(), question, answer, ...analysis, createdAt };
    const snapshot = await createOpportunitySnapshot({
      userId: user.id,
      opportunityId,
      snapshotType: "interview_feedback",
      title: `单题练习 · ${question.slice(0, 48)}`,
      content: record,
      createdBy: "hosted_ai",
      metadata: { mode: "quick_practice", verdict: analysis.verdict },
    });
    return NextResponse.json({ ok: true, record: { ...record, id: String(snapshot.id || record.id) }, remainingToday: Math.max(0, 2 - (count || 0)) });
  } catch (error) {
    await createOpportunitySnapshot({
      userId: user.id,
      opportunityId,
      snapshotType: "interview_feedback",
      title: `单题练习待分析 · ${question.slice(0, 48)}`,
      content: { id: crypto.randomUUID(), question, answer, status: "analysis_failed", createdAt },
      createdBy: "system",
      metadata: { mode: "quick_practice", status: "analysis_failed" },
    }).catch(() => undefined);
    console.error("Quick interview practice failed", error);
    return NextResponse.json({ ok: false, saved: true, error: "回答已保存，但 AI 分析暂时失败，请重试" }, { status: 502 });
  }
}
