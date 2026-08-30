import type { ResumeChange } from "@/lib/opportunities/types";

export interface TextQualityFinding {
  code: "empty" | "too_short" | "missing_contact" | "low_keyword_coverage" | "replacement_missed" | "pdf_no_text" | "pdf_text_mismatch";
  severity: "error" | "warning";
  message: string;
}

export function applyResumeChanges(source: string, changes: ResumeChange[]) {
  let text = source;
  const findings: TextQualityFinding[] = [];
  for (const change of changes.filter((item) => item.status !== "rejected")) {
    if (!change.before || !text.includes(change.before)) {
      findings.push({ code: "replacement_missed", severity: "error", message: `无法定位原文：${change.section}` });
      continue;
    }
    text = text.replace(change.before, change.after);
  }
  return { text, findings };
}

function keywordTokens(text: string) {
  const english = text.toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g) || [];
  const chinese = (text.match(/[\p{Script=Han}]{2,8}/gu) || []).flatMap((run) => {
    const tokens: string[] = [];
    for (let index = 0; index < run.length - 1; index += 1) tokens.push(run.slice(index, index + 2));
    return tokens;
  });
  return [...new Set([...english, ...chinese])].filter((token) => !/^(负责|相关|能力|工作|岗位|要求|优先|以及|进行|具有|具备)$/.test(token));
}

export function reviewAtsText(resumeText: string, jobDescription: string) {
  const findings: TextQualityFinding[] = [];
  const normalized = resumeText.trim();
  if (!normalized) findings.push({ code: "empty", severity: "error", message: "简历正文为空。" });
  else if (normalized.length < 180) findings.push({ code: "too_short", severity: "warning", message: "简历正文过短，可能缺少完整经历。" });
  if (!/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(normalized) && !/(?:\+?86[- ]?)?1[3-9]\d{9}/.test(normalized)) {
    findings.push({ code: "missing_contact", severity: "warning", message: "未检测到邮箱或手机号，请在投递前确认联系方式。" });
  }
  const keywords = keywordTokens(jobDescription).slice(0, 80);
  const hits = keywords.filter((token) => normalized.toLowerCase().includes(token)).length;
  const coverage = keywords.length ? hits / keywords.length : 1;
  if (keywords.length >= 5 && coverage < 0.12) findings.push({ code: "low_keyword_coverage", severity: "warning", message: "岗位关键词覆盖偏低，请确认核心要求是否已用真实经历表达。" });
  return { ok: !findings.some((finding) => finding.severity === "error"), coverage, findings };
}

function compactText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}

export function reviewPdfText(pdfText: string, expectedResumeText: string) {
  const findings: TextQualityFinding[] = [];
  const actual = compactText(pdfText);
  const expected = compactText(expectedResumeText);
  if (actual.length < 100) findings.push({ code: "pdf_no_text", severity: "error", message: "PDF 缺少可检索文字层，招聘系统可能无法解析。" });
  const anchors = expected.match(/[\p{L}\p{N}]{6,20}/gu)?.slice(0, 30) || [];
  const overlap = anchors.length ? anchors.filter((anchor) => actual.includes(anchor)).length / anchors.length : 0;
  if (actual.length >= 100 && anchors.length && overlap < 0.35) findings.push({ code: "pdf_text_mismatch", severity: "error", message: "PDF 文字与当前投递版本不一致，请重新导出。" });
  return { ok: !findings.some((finding) => finding.severity === "error"), overlap, findings };
}
