jest.mock("./product-events", () => ({
  trackProductEvent: jest.fn(),
  analyticsPage: (pathname: string) => (pathname === "/cockpit" || pathname === "/" ? pathname : null),
}));

import { trackProductEvent } from "./product-events";
import { resetEntryTelemetryForTest, trackEntryFailed, trackEntryPresented, trackEntrySelected, trackEntrySubmitted } from "./entry-telemetry";

const emitted = () => (trackProductEvent as jest.Mock).mock.calls.map(([name, properties]) => ({ name, properties }));

// The §5.3 contract: these four events may only carry these fields. Material text,
// file names and contact details have no key to arrive under.
const ALLOWED_KEYS = new Set(["entry_kind", "page_category", "entry_source", "submission_id", "request_id", "stage", "reason_code", "reused_material", "deferred"]);

function installStorage() {
  const data = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    location: { pathname: "/cockpit" },
    sessionStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
  };
}

beforeEach(() => {
  installStorage();
  (trackProductEvent as jest.Mock).mockClear();
  resetEntryTelemetryForTest();
});

afterEach(() => { delete (globalThis as { window?: unknown }).window; });

describe("entry events", () => {
  it("counts a choice once per tab, so a refresh is not a new choice", () => {
    trackEntrySelected("jd", "click");
    trackEntrySelected("jd", "url");
    trackEntrySelected("resume", "url");
    expect(emitted()).toEqual([
      { name: "entry_selected", properties: { entry_kind: "jd", page_category: "/cockpit", entry_source: "click" } },
      { name: "entry_selected", properties: { entry_kind: "resume", page_category: "/cockpit", entry_source: "url" } },
    ]);
  });

  it("keeps counting when storage is unavailable in this browser", () => {
    delete (globalThis as { window?: { sessionStorage?: unknown } }).window;
    (globalThis as { window?: unknown }).window = { location: { pathname: "/" } };
    expect(() => trackEntrySelected("one_sentence", "click")).not.toThrow();
    expect(emitted()).toHaveLength(1);
  });

  it("links one submit to the server request id when there is one, and never counts a cached retry twice", () => {
    trackEntrySubmitted("jd", "sub-1", "req-1");
    trackEntrySubmitted("jd", "sub-2", "req-1");
    trackEntrySubmitted("jd", "sub-3", null);
    expect(emitted().map((event) => event.properties.submission_id)).toEqual(["sub-1", "sub-3"]);
    expect(emitted()[0].properties.request_id).toBe("req-1");
    expect(emitted()[1].properties.request_id).toBeUndefined();
  });

  it("reports a rendered result once per submission", () => {
    trackEntryPresented("resume", "sub-1", { request_id: "req-1", deferred: false });
    trackEntryPresented("resume", "sub-1", { request_id: "req-1", deferred: false });
    trackEntryPresented("resume", "sub-2", { request_id: "req-2", deferred: true });
    const events = emitted();
    expect(events).toHaveLength(2);
    expect(events[1].properties.deferred).toBe(true);
  });

  it("separates a stage failure from an already-presented result", () => {
    trackEntryFailed("jd", "save", "save_failed", "sub-1");
    trackEntryFailed("jd", "save", "save_failed", "sub-1");
    trackEntryFailed("jd", "analysis", "intake_failed", "sub-1");
    expect(emitted()).toEqual([
      { name: "entry_failed", properties: { entry_kind: "jd", page_category: "/cockpit", submission_id: "sub-1", stage: "save", reason_code: "save_failed" } },
      { name: "entry_failed", properties: { entry_kind: "jd", page_category: "/cockpit", submission_id: "sub-1", stage: "analysis", reason_code: "intake_failed" } },
    ]);
  });

  it("refuses to carry anything outside the agreed property set", () => {
    trackEntrySelected("one_sentence", "click");
    trackEntrySubmitted("one_sentence", "sub-1", null, { reused_material: false });
    trackEntryPresented("one_sentence", "sub-1", { request_id: "req-1", deferred: false, reused_material: false });
    trackEntryFailed("one_sentence", "conversation", "network_error", "sub-1");
    for (const event of emitted()) {
      expect(Object.keys(event.properties).every((key) => ALLOWED_KEYS.has(key))).toBe(true);
      expect(event.properties.entry_kind).toBe("one_sentence");
      expect(event.properties.page_category).toBe("/cockpit");
    }
  });
});
