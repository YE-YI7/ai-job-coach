export const PRODUCT_EVENT_NAMES = [
  "cockpit_viewed",
  "material_intake_started",
  "material_intake_completed",
  "material_intake_failed",
  "opportunity_material_started",
  "opportunity_material_completed",
  "opportunity_material_failed",
  "today_action_completed",
  "mentor_action_snoozed",
  "mentor_feedback_submitted",
  "evidence_confirmed",
  "resume_generation_started",
  "resume_generation_completed",
  "resume_generation_failed",
  "resume_change_reviewed",
  "resume_change_edited",
  "resume_change_revalidated",
  "mock_interview_started",
  "mock_interview_completed",
  "interview_practice_started",
  "interview_practice_completed",
  "interview_practice_saved",
  "interview_review_saved",
  "interview_review_started",
  "interview_review_completed",
  "interview_review_failed",
  "offer_calc_used",
  "offer_added",
  "offer_save_click",
  "offer_save_signup",
  "resume_gap_used",
  "resume_gap_signup",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];
export type ProductEventProperties = Record<string, string | number | boolean | null | undefined>;

const SOURCE_KEY = "yi-zhi-first-touch-source-v1";
export const ANON_ID_STORAGE_KEY = "yi-zhi-anon-id-v1";
const ANON_ID_PATTERN = /^[a-zA-Z0-9_-]{8,96}$/;

export function isProductEventName(value: unknown): value is ProductEventName {
  return typeof value === "string" && PRODUCT_EVENT_NAMES.includes(value as ProductEventName);
}

export function normalizeAnonId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return ANON_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function buildEventIdentity(userId: string | null, anonId: string | null): string | null {
  if (userId) return userId;
  if (anonId) return `anon:${anonId}`;
  return null;
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

export function getOrCreateAnonId(): string {
  try {
    const stored = window.localStorage.getItem(ANON_ID_STORAGE_KEY);
    const valid = normalizeAnonId(stored);
    if (valid) return valid;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(ANON_ID_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

// Decide the upsert row + conflict target. Kept pure + exported so the "login
// tracking must not depend on the anon migration" rule is unit-tested. A logged
// in event writes ONLY classic columns and dedups on (user_id, client_event_id)
// — that unique index exists with or without the anon migration. Only an
// anonymous event (no userId) needs anon_id + the generated event_identity dedup,
// which is the sole thing gated on the migration being applied first.
export function buildProductEventWrite(input: {
  userId: string | null;
  anonId: string | null;
  name: string;
  clientEventId: string;
  occurredAt: string;
  properties: Record<string, string | number | boolean | null>;
}): { row: Record<string, unknown>; onConflict: string } {
  const { userId, anonId, name, clientEventId, occurredAt, properties } = input;
  if (userId) {
    return {
      row: { user_id: userId, event_name: name, client_event_id: clientEventId, occurred_at: occurredAt, properties },
      onConflict: "user_id,client_event_id",
    };
  }
  return {
    row: { user_id: null, anon_id: anonId, event_name: name, client_event_id: clientEventId, occurred_at: occurredAt, properties },
    onConflict: "event_identity,client_event_id",
  };
}

export function trackProductEvent(name: ProductEventName, properties: ProductEventProperties = {}) {
  if (typeof window === "undefined") return;
  const payload = {
    name,
    clientEventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    anonId: getOrCreateAnonId(),
    properties: sanitizeEventProperties({ source: captureAcquisitionSource(), ...properties }),
  };
  void fetch("/api/product-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}
