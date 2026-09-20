import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { createCockpitOpportunity, deleteCockpitOpportunity, listCockpitOpportunities, updateCockpitOpportunity, updateCockpitOpportunityStage } from "@/lib/coach-harness/repository";
import { STAGE_STATUS_WORDS } from "@/lib/opportunities/timeline";
import type { Opportunity } from "@/lib/opportunities/types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try { return NextResponse.json({ ok: true, opportunities: await listCockpitOpportunities(user.id) }); }
  catch { return NextResponse.json({ ok: false, error: "岗位读取失败" }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const body = await request.json();
    const input = body.opportunity as Omit<Opportunity, "id">;
    const workspaceType = input?.workspaceType === "preparation" ? "preparation" : "job";
    const hasPreparationMaterial = Boolean(String(input?.resumeText || input?.profileText || "").trim());
    const hasJobDescription = Boolean(String(input?.jdText || "").trim());
    if (!input || !String(input.company || "").trim() || !String(input.role || "").trim()
      || (workspaceType === "job" ? !hasJobDescription : !hasPreparationMaterial)) {
      return NextResponse.json({ ok: false, error: "岗位字段不完整" }, { status: 400 });
    }
    const opportunity = await createCockpitOpportunity(user.id, {
      ...input,
      workspaceType,
      company: String(input.company).trim().slice(0, 120),
      role: String(input.role).trim().slice(0, 160),
      jdText: String(input.jdText).trim().slice(0, 30_000),
      resumeText: String(input.resumeText || "").trim().slice(0, 30_000),
      profileText: String(input.profileText || "").trim().slice(0, 30_000),
    });
    return NextResponse.json({ ok: true, opportunity }, { status: 201 });
  } catch (error) {
    console.error("Create coach opportunity failed", error);
    return NextResponse.json({ ok: false, error: "岗位云同步失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const body = await request.json();
    if (body.stageUpdate !== undefined) {
      const { id, stage } = body.stageUpdate || {};
      if (typeof id !== "string" || !uuid.test(id) || typeof stage !== "string" || !Object.hasOwn(STAGE_STATUS_WORDS, stage)) {
        return NextResponse.json({ ok: false, error: "岗位状态无效" }, { status: 400 });
      }
      await updateCockpitOpportunityStage(user.id, id, stage as Opportunity["stage"]);
      return NextResponse.json({ ok: true });
    }
    const opportunity = body.opportunity as Opportunity;
    if (!opportunity?.id || !opportunity.company || !opportunity.role) return NextResponse.json({ ok: false, error: "岗位字段不完整" }, { status: 400 });
    await updateCockpitOpportunity(user.id, opportunity, body.preserveStage === true);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "岗位同步失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !uuid.test(id)) return NextResponse.json({ ok: false, error: "岗位无效" }, { status: 400 });
  try {
    await deleteCockpitOpportunity(user.id, id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "岗位删除失败" }, { status: 500 });
  }
}
