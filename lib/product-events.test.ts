import {
  buildEventIdentity,
  isProductEventName,
  normalizeAnonId,
  sanitizeEventProperties,
} from "./product-events";

describe("product events", () => {
  it("only accepts the controlled event vocabulary", () => {
    expect(isProductEventName("cockpit_viewed")).toBe(true);
    expect(isProductEventName("arbitrary_event")).toBe(false);
  });

  it("accepts the new offer funnel events", () => {
    expect(isProductEventName("offer_calc_used")).toBe(true);
    expect(isProductEventName("offer_added")).toBe(true);
    expect(isProductEventName("offer_save_click")).toBe(true);
    expect(isProductEventName("offer_save_signup")).toBe(true);
  });

  it("bounds keys and values and removes nested or unsupported data", () => {
    const result = sanitizeEventProperties({
      "workspace type": "preparation",
      long: "x".repeat(300),
      count: 2,
      ok: true,
      nested: { resume: "must not leak" },
    });
    expect(result.workspace_type).toBe("preparation");
    expect(String(result.long)).toHaveLength(160);
    expect(result.count).toBe(2);
    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty("nested");
  });

  it("normalizes anon ids with client_event_id-like length and charset rules", () => {
    const uuid = "3f2a9c1e-7d4b-4c8a-9e2f-1b6d5a0c3e77";
    expect(normalizeAnonId(uuid)).toBe(uuid);
    expect(normalizeAnonId("  valid_id-1  ")).toBe("valid_id-1");
    expect(normalizeAnonId("short")).toBeNull();
    expect(normalizeAnonId("bad id!/chars")).toBeNull();
    expect(normalizeAnonId("x".repeat(97))).toBeNull();
    expect(normalizeAnonId(null)).toBeNull();
    expect(normalizeAnonId(42)).toBeNull();
  });

  it("builds a NULL-safe identity preferring user over anon", () => {
    expect(buildEventIdentity("user-uuid-1", "anon-dev-1")).toBe("user-uuid-1");
    expect(buildEventIdentity("user-uuid-1", null)).toBe("user-uuid-1");
    expect(buildEventIdentity(null, "anon-dev-1")).toBe("anon:anon-dev-1");
    expect(buildEventIdentity(null, null)).toBeNull();
  });
});
