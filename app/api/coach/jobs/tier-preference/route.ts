import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { readUserTierPreference, saveTierPreference } from "@/lib/coach-harness/repository";
import type { CompanyTier } from "@/lib/coach-harness/subagents/verification";
import { isCompanyTier } from "@/lib/jobs/tier-intent";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

/** 面板要显示的当前偏好：生效档位 + 从哪来的 + 还没确认的意向。 */
export async function GET() {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401, headers });
  try {
    return NextResponse.json({ ok: true, preference: await readUserTierPreference(user.id) }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "偏好读取失败，本次没有改动" }, { status: 500, headers });
  }
}

/**
 * 用户点选档位（含点「不限」）。取值只认名录那三档的枚举，别的都不收——
 * 自由文本走对话抽取那条路，不在这里开第二个写入口。
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "请求格式不正确" }, { status: 400, headers }); }
  const tiers = (body as { tiers?: unknown })?.tiers;
  if (!Array.isArray(tiers) || tiers.length > 3 || !tiers.every(isCompanyTier)) {
    return NextResponse.json({ ok: false, error: "档位取值不认识，没有改动你的偏好" }, { status: 400, headers });
  }
  try {
    await saveTierPreference(user.id, tiers as CompanyTier[], "在找岗位面板点的选择");
    return NextResponse.json({ ok: true, preference: await readUserTierPreference(user.id) }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "偏好没有保存到云端，原设置保留" }, { status: 500, headers });
  }
}
