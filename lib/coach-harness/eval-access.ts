export function isEvalAdmin(
  user: { id?: string; email?: string | null } | null,
) {
  if (!user) return false;
  const ids = (process.env.EVAL_ADMIN_USER_IDS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return (
    (!!user.id && ids.includes(user.id)) ||
    (!!user.email &&
      (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
        .includes(user.email.toLowerCase()))
  );
}
export function readEvalAssessment(raw: string) {
  const clean = raw
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  const d = JSON.parse(clean);
  if (
    !d ||
    typeof d.score !== "number" ||
    !Number.isFinite(d.score) ||
    d.score < 0 ||
    d.score > 100 ||
    typeof d.reason !== "string" ||
    d.reason.length < 4 ||
    !Array.isArray(d.missingInformation)
  )
    throw Error("INVALID_EVAL_ASSESSMENT");
  const allowed = [
    "missing_information",
    "grounding",
    "quality",
    "retrieval",
    "format",
    "system",
    "none",
    "unknown",
  ];
  if (
    !allowed.includes(d.problemType) ||
    !d.missingInformation.every((v: unknown) => typeof v === "string")
  )
    throw Error("INVALID_EVAL_ASSESSMENT");
  return {
    source: "llm_self_eval",
    score: d.score,
    maxScore: 100,
    reason: d.reason,
    problemType: d.problemType,
    missingInformation: d.missingInformation,
    criteria: Array.isArray(d.criteria) ? d.criteria : [],
    rubricVersion: "resume-whole-document-observation-v1",
    groundingVeto: d.groundingVeto === true,
  };
}
