import { analyticsPage, trackProductEvent, type ProductEventProperties } from "./product-events";
import type { EntryKind } from "./entry-doors";

/**
 * Client-side entry telemetry only. These calls never claim a server-side
 * terminal state: submission means the browser sent one attempt, presentation
 * means the browser rendered it. Delivery/quota conclusions belong to the
 * server events and Grok's `delivery` receipt.
 */
export type EntryStage = "intake" | "analysis" | "save" | "conversation" | "restore";

const SELECTED_KEY = "yi-zhi.entry-selected-v1";
const inMemory = new Set<string>();

function tabState(): { read: () => string[]; write: (kinds: string[]) => void } {
  try {
    const storage = window.sessionStorage;
    return {
      read: () => {
        try {
          const parsed = JSON.parse(storage.getItem(SELECTED_KEY) || "[]");
          return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
        } catch {
          return [];
        }
      },
      write: (kinds) => {
        try {
          storage.setItem(SELECTED_KEY, JSON.stringify(kinds));
        } catch { /* A blocked write only loses the dedup, never the click. */ }
      },
    };
  } catch {
    // Private modes can reject even access; fall back to this mount only.
    let cached: string[] = [];
    return { read: () => cached, write: (kinds) => { cached = kinds; } };
  }
}

/** Once per key for the life of the page, so remounts and StrictMode cannot double count. */
function once(key: string) {
  if (inMemory.has(key)) return false;
  inMemory.add(key);
  return true;
}

export function resetEntryTelemetryForTest() {
  inMemory.clear();
  try {
    window.sessionStorage.removeItem(SELECTED_KEY);
  } catch { /* No storage access to clear. */ }
}

function baseProperties(kind: EntryKind): ProductEventProperties {
  return { entry_kind: kind, page_category: analyticsPage(window.location.pathname) || "/other" };
}

export function trackEntrySelected(kind: EntryKind, source: "url" | "click") {
  const state = tabState();
  const seen = state.read();
  // Refreshing restores the same choice; that is not a new selection.
  if (seen.includes(kind)) return;
  state.write([...seen, kind]);
  trackProductEvent("entry_selected", { ...baseProperties(kind), entry_source: source });
}

export function trackEntrySubmitted(kind: EntryKind, submissionId: string, requestId: string | null, extra: ProductEventProperties = {}) {
  // One browser submit is one attempt marker; the server-side intake id links it
  // to the real call, and a cached id (same material resent) must not double count.
  if (!submissionId || !once(`submitted:${kind}:${requestId || submissionId}`)) return;
  trackProductEvent("entry_submitted", {
    ...baseProperties(kind),
    submission_id: submissionId,
    ...(requestId ? { request_id: requestId } : {}),
    ...extra,
  });
}

export function trackEntryPresented(kind: EntryKind, submissionId: string, extra: ProductEventProperties = {}) {
  if (!submissionId || !once(`presented:${kind}:${submissionId}`)) return;
  trackProductEvent("entry_result_presented", { ...baseProperties(kind), submission_id: submissionId, ...extra });
}

/** Fixed stage + code only. Error bodies, material text and file names stay out. */
export function trackEntryFailed(kind: EntryKind, stage: EntryStage, reasonCode: string, submissionId?: string | null) {
  if (!once(`failed:${kind}:${stage}:${submissionId || reasonCode}`)) return;
  trackProductEvent("entry_failed", {
    ...baseProperties(kind),
    ...(submissionId ? { submission_id: submissionId } : {}),
    stage,
    reason_code: reasonCode,
  });
}
