import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { createCockpitOpportunity, deleteCockpitOpportunity, listCockpitOpportunities, recordTierIntentFromText, updateCockpitOpportunity, updateCockpitOpportunityStage } from "@/lib/coach-harness/repository";
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
    const intakeRequestId = typeof body.intakeRequestId === "string" && uuid.test(body.intakeRequestId) ? body.intakeRequestId : undefined;
    if (body.intakeRequestId !== undefined && !intakeRequestId) return NextResponse.json({ ok: false, error: "材料任务编号无效" }, { status: 400 });
    const workspaceType = input?.workspaceType === "preparation" ? "preparation" : "job";
    const hasPreparationMaterial = Boolean(String(input?.resumeText || input?.profileText || "").trim());
    const hasJobDescription = Boolean(String(input?.jdText || "").trim());
    if (!input || !String(input.company || "").trim() || !String(input.role || "").trim()
      || (workspaceType === "job" ? !hasJobDescription : !hasPreparationMaterial)) {
      return NextResponse.json({ ok: false, error: "岗位字段不完整" }, { status: 400 });
    }
    // Recover an ordinary lost-response retry from the user's own saved metadata.
    // This is not a database-atomic concurrent deduplication guarantee.
    if (intakeRequestId) {
      const existing = (await listCockpitOpportunities(user.id)).find(item => item.intakeRequestId === intakeRequestId);
      if (existing) return NextResponse.json({ ok: true, opportunity: existing, replay: true });
    }
    const opportunity = await createCockpitOpportunity(user.id, {
      ...input,
      intakeRequestId,
      workspaceType,
      company: String(input.company).trim().slice(0, 120),
      role: String(input.role).trim().slice(0, 160),
      jdText: String(input.jdText).trim().slice(0, 30_000),
      resumeText: String(input.resumeText || "").trim().slice(0, 30_000),
      profileText: String(input.profileText || "").trim().slice(0, 30_000),
    });
    // 只解析用户自己打的那句方向（如「目标：大厂产品经理」）；
    // JD 与简历正文不解析——「我们是创业公司」是用人方自述，不是用户的档位意向。
    // 岗位已经存好了，这一步坏了不能回头报「保存失败」，所以就地吞掉只记日志。
    try { await recordTierIntentFromText({ userId: user.id, text: opportunity.role, opportunityId: opportunity.id }); }
    catch (error) { console.error("Tier intent capture failed", error); }
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
    // 改方向时同样接住档位意向（只解析方向这句短句，正文材料不解析）
    try { await recordTierIntentFromText({ userId: user.id, text: opportunity.role, opportunityId: opportunity.id }); }
    catch (error) { console.error("Tier intent capture failed", error); }
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
