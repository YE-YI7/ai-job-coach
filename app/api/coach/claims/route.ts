import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { assertUuid, confirmClaim, createClaim, listClaims, withdrawClaim } from "@/lib/coach-harness/repository";
import type { CareerClaim } from "@/lib/coach-harness";

export const runtime = "nodejs";
const entityTypes = new Set<CareerClaim["entityType"]>(["profile", "experience", "project", "skill", "metric", "preference", "education"]);
const statuses = new Set<CareerClaim["status"]>(["confirmed", "unverified", "conflicted"]);
const visibilities = new Set<CareerClaim["visibility"]>(["private", "recruiter_safe", "public"]);
const reviewActions = new Set(["confirm", "withdraw"]);

/**
 * 批量核对（FR-4 · §5.4 三档确认）的服务端落点：对话里抽出的候选事实攒在这里，
 * 用户点头才升 `confirmed` + `user_confirmed`，撤回则退出可见集合但不删来源记录。
 * 动作只有这两个——改文本要走简历链路，不在这里开第二条写入口。
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const body = await request.json();
    const action = String(body.action || "");
    if (!reviewActions.has(action)) return NextResponse.json({ ok: false, error: "只支持 confirm 或 withdraw" }, { status: 400 });
    const claimId = assertUuid(String(body.claimId || ""), "claimId");
    const claim = action === "confirm" ? await confirmClaim(user.id, claimId) : await withdrawClaim(user.id, claimId, "user_review");
    return NextResponse.json({ ok: true, claim });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("无效")) return NextResponse.json({ ok: false, error: message }, { status: 400 });
    if (message.includes("不存在")) return NextResponse.json({ ok: false, error: "这条事实不在你的档案里" }, { status: 404 });
    return NextResponse.json({ ok: false, error: "核对结果没有保存到云端，原状态保留" }, { status: 500 });
  }
}

export async function GET() {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try { return NextResponse.json({ ok: true, claims: await listClaims(user.id) }); }
  catch { return NextResponse.json({ ok: false, error: "事实库读取失败" }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const body = await request.json();
    const entityType = String(body.entityType || "") as CareerClaim["entityType"];
    const status = String(body.status || "unverified") as CareerClaim["status"];
    const visibility = String(body.visibility || "private") as CareerClaim["visibility"];
    const entityKey = String(body.entityKey || "").trim().slice(0, 200);
    const claimType = String(body.claimType || "").trim().slice(0, 120);
    const displayText = String(body.displayText || "").trim().slice(0, 2000);
    if (!entityTypes.has(entityType) || !statuses.has(status) || !visibilities.has(visibility) || !entityKey || !claimType || !displayText) {
      return NextResponse.json({ ok: false, error: "事实字段不完整" }, { status: 400 });
    }
    const claim = await createClaim({ userId: user.id, opportunityId: body.opportunityId, sourceId: body.sourceId, entityType, entityKey, claimType, value: body.value ?? displayText, displayText, sourceExcerpt: body.sourceExcerpt, status, visibility });
    return NextResponse.json({ ok: true, claim }, { status: 201 });
  } catch { return NextResponse.json({ ok: false, error: "事实保存失败" }, { status: 500 }); }
}
