export const PUBLIC_SITE_URL = "https://yizhioffer.com";

// Deliberate allowlist: never include user workspaces, preview, login or APIs.
export const PUBLIC_INDEX_PATHS = ["/", "/agent", "/tools/resume-jd-gap", "/tools/offer-compare", "/guides/resume-without-metrics", "/tools/interview-review"] as const;
export const PRIVATE_CRAWL_PATHS = ["/api/", "/cockpit", "/login", "/invite", "/redeem", "/resume-score"];
