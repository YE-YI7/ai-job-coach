import { normalizeRedirectPath, postLoginTarget, readCookieValue } from "./auth-redirect";

describe("OAuth redirect helpers", () => {
  it.each(["resume", "jd", "find_jobs", "one_sentence"])("keeps the chosen material door through login: %s", entry => {
    expect(postLoginTarget(`/cockpit?entry=${entry}`)).toBe(`/cockpit?entry=${entry}`);
  });
  it("takes new and returning users to the current workspace", () => {
    expect(postLoginTarget()).toBe('/cockpit');
    expect(postLoginTarget('/onboarding')).toBe('/cockpit');
    expect(postLoginTarget('/onboarding/stage-select')).toBe('/cockpit');
    expect(postLoginTarget('/onboarding?redirect=%2Fadmin%2Fevals')).toBe('/admin/evals');
    expect(postLoginTarget('/account/phone?recover=1')).toBe('/account/phone?recover=1');
    expect(postLoginTarget('/resume-score')).toBe('/resume-score');
    expect(postLoginTarget('/\\evil.test')).toBe('/cockpit');
    expect(postLoginTarget('/onboarding?redirect=%2Fonboarding')).toBe('/cockpit');
  });
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
