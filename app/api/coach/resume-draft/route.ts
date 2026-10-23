import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { recordWorkspaceResume } from "@/lib/coach-harness/workspace-eval";
import { runResumeDraft } from "@/lib/coach-harness/resume-execution";
import {observeDirectResume} from '@/lib/coach-harness/resume-direct-delivery';

export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  // Strategies/billing isolation are server-only execution options, never request-body flags.
  return observeDirectResume(user.id,request,input=>recordWorkspaceResume(user,input, core => runResumeDraft(core, user)));
}
