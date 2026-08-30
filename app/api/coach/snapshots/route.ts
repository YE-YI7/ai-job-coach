import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { createOpportunitySnapshot } from "@/lib/coach-harness/repository";
import type { OpportunitySnapshotType } from "@/lib/coach-harness";

export const runtime = "nodejs";
const allowed = new Set<OpportunitySnapshotType>(["application_answers", "interview_brief", "interview_feedback", "outcome"]);

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const body = await request.json();
    const opportunityId = String(body.opportunityId || "").trim();
    const snapshotType = String(body.snapshotType || "") as OpportunitySnapshotType;
    const title = String(body.title || "").trim().slice(0, 160);
    if (!opportunityId || !allowed.has(snapshotType) || !title || body.content === undefined) return NextResponse.json({ ok: false, error: "档案字段不完整" }, { status: 400 });
    const snapshot = await createOpportunitySnapshot({ userId: user.id, opportunityId, snapshotType, title, content: body.content, createdBy: "user", metadata: body.metadata || {} });
    return NextResponse.json({ ok: true, snapshot }, { status: 201 });
  } catch (error) {
    console.error("Create coach snapshot failed", error);
    return NextResponse.json({ ok: false, error: "岗位档案保存失败" }, { status: 500 });
  }
}
