import { getClientAddress, hashRateLimitIdentity } from "./public-rate-limit";

describe("public rate limit identity", () => {
  it("prefers the proxy client address and normalizes it", () => {
    const request = new Request("https://example.com", {
      headers: { "x-real-ip": " 203.0.113.9 ", "x-forwarded-for": "198.51.100.2, 10.0.0.1" },
    });
    expect(getClientAddress(request)).toBe("203.0.113.9");
  });

  it("hashes identifiers without exposing the email or address", () => {
    const value = hashRateLimitIdentity("auth-send-code", "203.0.113.9", "User@Example.com", "secret");
    expect(value).toHaveLength(64);
    expect(value).toBe(hashRateLimitIdentity("auth-send-code", "203.0.113.9", "user@example.com", "secret"));
    expect(value).not.toContain("example");
    expect(value).not.toContain("203");
  });
});
