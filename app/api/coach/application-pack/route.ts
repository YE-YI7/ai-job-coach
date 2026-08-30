import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { applyResumeChanges, reviewAtsText, validateArtifactDraft } from "@/lib/coach-harness";
import { createArtifactWithClaims, createOpportunitySnapshot, getContextBundleForUser, listArtifactReviews, recordArtifactReview } from "@/lib/coach-harness/repository";
import type { ResumeChange } from "@/lib/opportunities/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const body = await request.json();
    const opportunityId = String(body.opportunityId || "").trim();
    const reviewedArtifactId = String(body.artifactId || "").trim();
    const resumeText = String(body.resumeText || "").trim().slice(0, 30_000);
    const jobDescription = String(body.jobDescription || "").trim().slice(0, 30_000);
    const changes = (Array.isArray(body.changes) ? body.changes : []).slice(0, 20) as ResumeChange[];
    if (!opportunityId || !reviewedArtifactId || !resumeText || !jobDescription) return NextResponse.json({ ok: false, error: "投递版本字段不完整" }, { status: 400 });
    const priorReviews = await listArtifactReviews(user.id, opportunityId, reviewedArtifactId);
    if (!priorReviews.some((review: { reviewer_type: string; status: string }) => review.reviewer_type === "independent_ai" && review.status === "passed")) {
      return NextResponse.json({ ok: false, error: "独立复核未通过，不能冻结投递版本" }, { status: 409 });
    }
    const accepted = changes.filter((change) => change.status === "accepted");
    const applied = applyResumeChanges(resumeText, accepted);
    if (applied.findings.length) return NextResponse.json({ ok: false, error: applied.findings[0].message }, { status: 422 });
    const context = await getContextBundleForUser({ userId: user.id, task: "resume_workshop", opportunityId });
    const sections = accepted.map((change, index) => ({ path: `changes.${index}.after`, content: change.after, claimIds: change.evidenceIds || (change.evidenceId ? [change.evidenceId] : []) }));
    const facts = validateArtifactDraft({ artifactType: "target_resume", visibility: "recruiter_safe", sections }, context);
    if (!facts.ok) return NextResponse.json({ ok: false, error: facts.issues[0]?.message || "事实校验未通过", issues: facts.issues }, { status: 422 });
    const ats = reviewAtsText(applied.text, jobDescription);
    if (!ats.ok) return NextResponse.json({ ok: false, error: ats.findings[0]?.message || "ATS 校验未通过" }, { status: 422 });
    const artifact = await createArtifactWithClaims({
      userId: user.id, opportunityId, artifactType: "target_resume", title: "已冻结投递简历",
      content: { resumeText: applied.text, jobDescription, acceptedChanges: accepted }, status: "confirmed",
      contextSnapshot: context, createdBy: "user",
      claimLinks: accepted.flatMap((change, index) => (change.evidenceIds || (change.evidenceId ? [change.evidenceId] : [])).map((claimId) => ({ claimId, usagePath: `acceptedChanges.${index}.after` }))),
    });
    await Promise.all([
      recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "facts", status: "passed", summary: "投递文本只使用已确认事实。", findings: [], contextFingerprint: context.fingerprint }),
      recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "independent_ai", status: "passed", summary: "起草版本已通过独立复核。", findings: [], contextFingerprint: context.fingerprint }),
      recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "ats", status: "passed", summary: `文本可解析；岗位词覆盖 ${(ats.coverage * 100).toFixed(0)}%。`, findings: ats.findings, contextFingerprint: context.fingerprint }),
      recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "pdf", status: "not_run", summary: "导出 PDF 后上传校验文字层。", findings: [], contextFingerprint: context.fingerprint }),
    ]);
    const snapshot = await createOpportunitySnapshot({
      userId: user.id, opportunityId, snapshotType: "submitted_resume", title: "投递简历",
      content: { resumeText: applied.text, acceptedChanges: accepted }, artifactId: String(artifact.id), createdBy: "user",
      metadata: { pdfVerified: false },
    });
    return NextResponse.json({ ok: true, artifactId: artifact.id, version: artifact.version, snapshotVersion: snapshot.version, resumeText: applied.text });
  } catch (error) {
    console.error("Freeze application pack failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "投递版本保存失败" }, { status: 500 });
  }
}
