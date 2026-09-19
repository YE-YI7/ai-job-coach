import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { createCockpitOpportunity } from "@/lib/coach-harness/repository";
import { MAX_BODY_CHARS, buildOfferOpportunity } from "@/lib/opportunities/offer-save";

export const runtime = "nodejs";

/**
 * 保存 offer 对比到作战盘（POST /api/offers/save）。
 *
 * 校验与组装全部走纯函数 buildOfferOpportunity（见 lib/opportunities/offer-save.ts）；
 * 落库复用 createCockpitOpportunity：workspaceType/offerComparison 等字段随 metadata
 * jsonb 往返，无需迁移。不调用任何外部模型。
 */
export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ ok: false, error: "无法读取请求体" }, { status: 400 });
  }
  if (raw.length > MAX_BODY_CHARS) {
    return NextResponse.json({ ok: false, error: "请求体过大" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const built = buildOfferOpportunity(body, new Date().toISOString());
  if (!built.ok) {
    return NextResponse.json({ ok: false, error: built.error }, { status: 400 });
  }

  try {
    const created = await createCockpitOpportunity(user.id, built.opportunity);
    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    console.error("Save offer comparison failed", error);
    return NextResponse.json({ ok: false, error: "保存 offer 对比失败" }, { status: 500 });
  }
}
