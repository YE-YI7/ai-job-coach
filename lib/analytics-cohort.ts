/** Only explicit operator configuration identifies internal accounts. */
export function analyticsCohort(
  userId: string | null,
  configuredIds: string | undefined,
  anonId: string | null = null,
  configuredVisitors: string | undefined = undefined,
) {
  const ids = new Set(
    (configuredIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const visitors = new Set(
    (configuredVisitors || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  // A logged-in third party on a shared browser is not silently classified as
  // the operator. Known browser exclusions apply only to anonymous visits.
  return (userId ? ids.has(userId) : !!anonId && visitors.has(anonId))
    ? "internal"
    : "unclassified";
}
