/** Cheap admission check, not a semantic assessment of interview quality. */
export function hasReviewMaterial(value: string): boolean {
  const meaningful = value.replace(/[\s\p{P}\p{S}]/gu, "");
  return meaningful.length >= 40 && new Set(meaningful).size >= 12;
}

export function hasGroundedReview(value: unknown, transcript: string): boolean {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  if (report.insufficient_evidence === true || !Array.isArray(report.questions) || !report.questions.length) return false;
  const normalize = (text: string) => text.replace(/\s/g, "");
  const source = normalize(transcript);
  return report.questions.every(question => {
    if (!question || typeof question !== "object") return false;
    const q = question as Record<string, unknown>;
    const quote = typeof q.evidence_quote === "string" ? normalize(q.evidence_quote) : "";
    return quote.length >= 12 && source.includes(quote) && typeof q.user_answer_summary === "string" && q.user_answer_summary.trim().length > 0;
  }) && typeof report.overall_comment === "string" && typeof report.overall_grade === "string" && /^[SABCD][+-]?$/.test(report.overall_grade);
}

export const REVIEW_MATERIAL_HINT = "这段内容还不足以复盘。请补充至少一道面试官的问题，以及你当时怎么回答；简历不能代替面试表现。";
