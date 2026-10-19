/** Server-only OAuth configuration. New-domain credentials must never fall back to the old app. */
export class WatchaOAuthConfigurationError extends Error {
  constructor(readonly reason: "unsupported_origin" | "missing_credentials") {
    super(reason === "unsupported_origin" ? "此域名暂不支持观猹登录" : "观猹登录暂未配置，请使用其他登录方式");
    this.name = "WatchaOAuthConfigurationError";
  }
}

export function getWatchaOAuthConfig(baseUrl?: string) {
  let url: URL;
  try {
    url = new URL(baseUrl || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000");
  } catch {
    throw new WatchaOAuthConfigurationError("unsupported_origin");
  }
  const legacy = ["ai-job-coach.xin", "www.ai-job-coach.xin"].includes(url.hostname);
  const yizhi = ["yizhioffer.com", "www.yizhioffer.com"].includes(url.hostname);
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const trusted = (legacy || yizhi) ? url.protocol === "https:" && !url.port : local && ["http:", "https:"].includes(url.protocol);
  if (!trusted || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new WatchaOAuthConfigurationError("unsupported_origin");
  }

  const clientId = (yizhi ? process.env.WATCHA_YIZHI_CLIENT_ID : process.env.WATCHA_CLIENT_ID)?.trim();
  const clientSecret = (yizhi ? process.env.WATCHA_YIZHI_CLIENT_SECRET : process.env.WATCHA_CLIENT_SECRET)?.trim();
  if (!clientId || !clientSecret) throw new WatchaOAuthConfigurationError("missing_credentials");
  return { clientId, clientSecret, redirectUri: `${url.origin}/api/auth/watcha/callback` };
}
