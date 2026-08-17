import { isProductEventName, sanitizeEventProperties } from "./product-events";

describe("product events", () => {
  it("only accepts the controlled event vocabulary", () => {
    expect(isProductEventName("cockpit_viewed")).toBe(true);
    expect(isProductEventName("arbitrary_event")).toBe(false);
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
});
