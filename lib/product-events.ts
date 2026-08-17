export const PRODUCT_EVENT_NAMES = [
  "cockpit_viewed",
  "material_intake_started",
  "material_intake_completed",
  "material_intake_failed",
  "today_action_completed",
  "mentor_action_snoozed",
  "evidence_confirmed",
  "resume_generation_started",
  "resume_generation_completed",
  "resume_generation_failed",
  "resume_change_reviewed",
  "mock_interview_started",
  "interview_practice_saved",
  "interview_review_saved",
  "interview_review_started",
  "interview_review_completed",
  "interview_review_failed",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];
export type ProductEventProperties = Record<string, string | number | boolean | null | undefined>;

const SOURCE_KEY = "yi-zhi-first-touch-source-v1";

export function isProductEventName(value: unknown): value is ProductEventName {
  return typeof value === "string" && PRODUCT_EVENT_NAMES.includes(value as ProductEventName);
}

export function sanitizeEventProperties(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 24);
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of entries) {
    const safeKey = key.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 48);
    if (!safeKey) continue;
    if (typeof item === "string") result[safeKey] = item.slice(0, 160);
    else if (typeof item === "number" && Number.isFinite(item)) result[safeKey] = item;
    else if (typeof item === "boolean" || item === null) result[safeKey] = item;
  }
  return result;
}

export function captureAcquisitionSource() {
  if (typeof window === "undefined") return "direct";
  const current = window.localStorage.getItem(SOURCE_KEY);
  if (current) return current;
  const params = new URLSearchParams(window.location.search);
  const source = (params.get("utm_source") || params.get("ref") || "direct")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 64);
  window.localStorage.setItem(SOURCE_KEY, source);
  return source;
}

export function trackProductEvent(name: ProductEventName, properties: ProductEventProperties = {}) {
  if (typeof window === "undefined") return;
  const payload = {
    name,
    clientEventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    properties: sanitizeEventProperties({ source: captureAcquisitionSource(), ...properties }),
  };
  void fetch("/api/product-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}
