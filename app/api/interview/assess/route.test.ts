import { POST } from "./route";

describe("legacy interview assessment route", () => {
  it("rejects the keyword-based legacy scorer and points to the real flow", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.replacement).toBe("/cockpit?tab=interview");
  });
});
