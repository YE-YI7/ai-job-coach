import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { listJobDecisions, saveJobDecision } from "@/lib/coach-harness/repository";
import { parseDecisionInput } from "@/lib/jobs/job-decision";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

/** 刷新后要找回自己表过的态：只回本人这批决定，界面按来源链接归位。 */
export async function GET() {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401, headers });
  try {
    return NextResponse.json({ ok: true, decisions: await listJobDecisions(user.id) }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "决定读取失败，本次没有改动" }, { status: 500, headers });
  }
}

/**
 * 保存一条决定（PRD A4）。字段全部在服务端校验，`user_id` 只从登录态取；
 * 校验不过就一条都不写，返回的话术直接说明是哪一项缺失。
 */
export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "请求格式不正确" }, { status: 400, headers }); }
  const parsed = parseDecisionInput(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400, headers });
  const binding = body as {requestId?:unknown;expectedClaimId?:unknown};
  const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
  if(typeof binding.requestId!=="string" || !uuid.test(binding.requestId) ||
    !(binding.expectedClaimId===null || typeof binding.expectedClaimId==="string" && uuid.test(binding.expectedClaimId)))
    return NextResponse.json({ok:false,error:"请刷新推荐后重试，决定尚未保存"},{status:400,headers});
  try {
    return NextResponse.json({ ok: true, decision: await saveJobDecision(user.id, parsed.input, {requestId:binding.requestId,expectedClaimId:binding.expectedClaimId}) }, { headers });
  } catch(error) {
    const message=String((error as {message?:string})?.message || error);
    const conflict=message.includes("decision_version_conflict");
    const invalid=/batch_not_found|job_not_in_batch|request_reused/.test(message);
    return NextResponse.json({ ok: false, error: conflict ? "另一处已更新这条决定，请刷新后重试" : invalid ? "这条岗位与推荐批次不一致，请重新查找" : "决定没有保存，你之前的选择还在" }, { status: conflict?409:invalid?400:503, headers });
  }
}
