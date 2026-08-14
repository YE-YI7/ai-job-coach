import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { compileContextBundle, validateArtifactDraft, type CareerClaim } from "@/lib/coach-harness";
import { callLLM } from "@/lib/llm";

export const runtime = "nodejs";

function parseJson(text: string) {
  const match = text.replace(/```json\s*/g, "").replace(/```/g, "").match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 返回格式错误");
  return JSON.parse(match[0]);
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const body = await request.json();
    const resumeText = String(body.resumeText || "").trim().slice(0, 30_000);
    const jobDescription = String(body.jobDescription || "").trim().slice(0, 30_000);
    if (!resumeText || !jobDescription) return NextResponse.json({ ok: false, error: "请先补充简历和 JD" }, { status: 400 });

    const lines = resumeText.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 120);
    const claims: CareerClaim[] = lines.map((line, index) => ({
      id: `resume-line-${index + 1}`,
      entityType: "experience",
      entityKey: `resume-line-${index + 1}`,
      claimType: "resume_source",
      value: line,
      displayText: line,
      sourceExcerpt: line,
      status: "confirmed",
      visibility: "recruiter_safe",
    }));
    const context = compileContextBundle({ task: "resume_workshop", userId: user.id, claims });
    const source = claims.map((claim) => `[${claim.id}] ${claim.displayText}`).join("\n");

    const output = await callLLM([
      { role: "system", content: `你是益职的岗位简历编辑器。只改写用户已经提供的事实，不补项目、职责、技能、数字或时间。每条建议必须引用能完整支持它的 sourceIds。若证据不够就不要生成。只返回 JSON：{"changes":[{"section":"经历位置","before":"原文原句","after":"可直接使用的新表述","reason":"与 JD 的具体对应","sourceIds":["resume-line-1"]}]}` },
      { role: "user", content: `目标 JD：\n${jobDescription}\n\n带编号的简历事实：\n${source}\n\n最多给出 6 条高价值修改。before 必须来自原文。` },
    ], { provider: "deepseek", temperature: 0.15, maxTokens: 2600, timeoutMs: 45_000, maxRetries: 1 });

    const parsed = parseJson(output);
    const rawChanges = Array.isArray(parsed.changes) ? parsed.changes.slice(0, 6) : [];
    const rejected: Array<{ index: number; reasons: string[] }> = [];
    const changes = rawChanges.flatMap((raw: Record<string, unknown>, index: number) => {
      const sourceIds = Array.isArray(raw.sourceIds) ? raw.sourceIds.map(String).filter((id) => context.allowedClaimIds.includes(id)) : [];
      const after = String(raw.after || "").trim().slice(0, 2000);
      const before = String(raw.before || "").trim().slice(0, 2000);
      const report = validateArtifactDraft({ artifactType: "target_resume", sections: [{ path: `changes.${index}.after`, content: after, claimIds: sourceIds }] }, context);
      if (!after || !before || !report.ok) {
        rejected.push({ index, reasons: report.issues.map((issue) => issue.message) });
        return [];
      }
      return [{
        id: `ai-change-${Date.now()}-${index}`,
        section: String(raw.section || "经历表述").slice(0, 100),
        before,
        after,
        reason: String(raw.reason || "提高与 JD 的对应度").slice(0, 500),
        evidenceId: sourceIds[0] || null,
        status: "pending" as const,
      }];
    });
    if (!changes.length) return NextResponse.json({ ok: false, error: "没有生成通过事实校验的修改，请补充更完整的经历" }, { status: 422 });
    return NextResponse.json({ ok: true, changes, rejectedCount: rejected.length, contextFingerprint: context.fingerprint });
  } catch (error) {
    console.error("Resume draft failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "简历生成失败" }, { status: 500 });
  }
}
