import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { validateArtifactDraft, type ArtifactDraft, type CoachActionType } from "@/lib/coach-harness";
import { getContextBundleForUser } from "@/lib/coach-harness/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const body = await request.json();
    const context = await getContextBundleForUser({ userId: user.id, task: body.task as CoachActionType, opportunityId: body.opportunityId });
    const report = validateArtifactDraft(body.draft as ArtifactDraft, context);
    return NextResponse.json({ ok: true, report, contextFingerprint: context.fingerprint });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "校验失败" }, { status: 400 });
  }
}
