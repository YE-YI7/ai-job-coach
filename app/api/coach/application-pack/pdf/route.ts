import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { reviewPdfText } from "@/lib/coach-harness";
import { getArtifactForUser, recordArtifactReview } from "@/lib/coach-harness/repository";
import { extractPdfText } from "@/lib/pdf-text";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    const opportunityId = String(form.get("opportunityId") || "");
    const artifactId = String(form.get("artifactId") || "");
    if (!(file instanceof File) || file.type !== "application/pdf" || !opportunityId || !artifactId) return NextResponse.json({ ok: false, error: "请选择对应投递版本的 PDF" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ ok: false, error: "PDF 不能超过 10MB" }, { status: 413 });
    const artifact = await getArtifactForUser(user.id, opportunityId, artifactId);
    const content = artifact.content as { resumeText?: string; previewText?: string };
    const expected = String(content.resumeText || content.previewText || "");
    const pdfText = await extractPdfText(Buffer.from(await file.arrayBuffer()));
    const review = reviewPdfText(pdfText, expected);
    await recordArtifactReview({ userId: user.id, opportunityId, artifactId, reviewerType: "pdf", status: review.ok ? "passed" : "failed", summary: review.ok ? "PDF 文字层可解析且与投递版本一致。" : review.findings[0]?.message || "PDF 校验失败。", findings: review.findings });
    return NextResponse.json({ ok: review.ok, review }, { status: review.ok ? 200 : 422 });
  } catch (error) {
    console.error("Verify application PDF failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "PDF 校验失败" }, { status: 500 });
  }
}
