import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { createClaim, listClaims } from "@/lib/coach-harness/repository";
import type { CareerClaim } from "@/lib/coach-harness";

export const runtime = "nodejs";
const entityTypes = new Set<CareerClaim["entityType"]>(["profile", "experience", "project", "skill", "metric", "preference", "education"]);
const statuses = new Set<CareerClaim["status"]>(["confirmed", "unverified", "conflicted"]);
const visibilities = new Set<CareerClaim["visibility"]>(["private", "recruiter_safe", "public"]);

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
