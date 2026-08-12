import { normalizeRedirectPath, readCookieValue } from "./auth-redirect";

describe("OAuth redirect helpers", () => {
  it("decodes an encoded redirect cookie including its query string", () => {
    const cookie = "watcha_oauth_state=state; watcha_oauth_redirect=%2Fresume-score%3Ffrom%3Dwatcha";

    expect(readCookieValue(cookie, "watcha_oauth_redirect")).toBe("/resume-score?from=watcha");
  });

  it("keeps equals signs in cookie values", () => {
    expect(readCookieValue("token=abc%3D%3D; other=value", "token")).toBe("abc==");
  });

  it("rejects external and login-loop redirects", () => {
    expect(normalizeRedirectPath("https://attacker.example")).toBeNull();
    expect(normalizeRedirectPath("//attacker.example/path")).toBeNull();
    expect(normalizeRedirectPath("/login?redirect=/chat")).toBeNull();
    expect(normalizeRedirectPath("/chat?from=watcha")).toBe("/chat?from=watcha");
  });
});
