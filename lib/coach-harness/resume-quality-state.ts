/** Derived from server-owned review records, never a client readiness flag. */
export function resumeQualityStatus(retainedOriginal: boolean, reviews: Array<{ reviewer_type: unknown; status: unknown }>): "ready" | "draft" | "blocked" {
  if (reviews.some(review => review.status === "failed")) return "blocked";
  const required = retainedOriginal ? ["facts", "ats"] : ["facts", "ats", "independent_ai"];
  return required.every(type => reviews.some(review => review.reviewer_type === type && review.status === "passed")) ? "ready" : "draft";
}

export function readReviewFindings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && typeof item === "object" && typeof item.message === "string").slice(0, 50).map(item => ({ message: String(item.message).slice(0, 800), changeId: typeof item.changeId === "string" ? item.changeId : undefined, severity: typeof item.severity === "string" ? item.severity : undefined }));
}
