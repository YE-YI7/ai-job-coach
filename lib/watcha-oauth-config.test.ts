import { getWatchaOAuthConfig, WatchaOAuthConfigurationError } from "./watcha-oauth-config";
import { exchangeCodeForToken, getWatchaAuthorizeUrl } from "./watcha-oauth";

const keys = ["WATCHA_CLIENT_ID", "WATCHA_CLIENT_SECRET", "WATCHA_YIZHI_CLIENT_ID", "WATCHA_YIZHI_CLIENT_SECRET", "NEXT_PUBLIC_BASE_URL", "NODE_ENV"] as const;
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
beforeEach(() => {
  process.env.WATCHA_CLIENT_ID = "synthetic-legacy-id+/=";
  process.env.WATCHA_CLIENT_SECRET = "synthetic-legacy-secret";
  process.env.WATCHA_YIZHI_CLIENT_ID = "synthetic-yizhi-id+/=";
  process.env.WATCHA_YIZHI_CLIENT_SECRET = "synthetic-yizhi-secret";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of keys) {
    if (original[key] === undefined) Reflect.deleteProperty(process.env, key);
    else Reflect.set(process.env, key, original[key]);
  }
});

test.each(["https://ai-job-coach.xin", "https://www.ai-job-coach.xin"])("旧域保留旧凭据：%s", base => {
  expect(getWatchaOAuthConfig(base)).toEqual({ clientId: "synthetic-legacy-id+/=", clientSecret: "synthetic-legacy-secret", redirectUri: `${base}/api/auth/watcha/callback` });
});
test.each(["https://yizhioffer.com", "https://www.yizhioffer.com"])("新域只用独立凭据：%s", base => {
  expect(getWatchaOAuthConfig(base)).toEqual({ clientId: "synthetic-yizhi-id+/=", clientSecret: "synthetic-yizhi-secret", redirectUri: `${base}/api/auth/watcha/callback` });
});
test.each(["WATCHA_YIZHI_CLIENT_ID", "WATCHA_YIZHI_CLIENT_SECRET"])("新域缺少 %s 时不拼接旧凭据", key => {
  delete process.env[key];
  expect(() => getWatchaOAuthConfig("https://yizhioffer.com")).toThrow(WatchaOAuthConfigurationError);
  expect(getWatchaOAuthConfig("https://www.ai-job-coach.xin").clientId).toBe("synthetic-legacy-id+/=");
});
test("旧域缺失凭据不改用新域，默认 base 与显式 base 选择一致", () => {
  delete process.env.WATCHA_CLIENT_SECRET;
  expect(() => getWatchaOAuthConfig("https://www.ai-job-coach.xin")).toThrow(WatchaOAuthConfigurationError);
  process.env.NEXT_PUBLIC_BASE_URL = "https://yizhioffer.com/";
  expect(getWatchaOAuthConfig().clientId).toBe("synthetic-yizhi-id+/=");
});
test.each(["https://attacker.invalid", "https://yizhioffer.com.attacker.invalid", "http://yizhioffer.com", "https://yizhioffer.com:8443", "https://user:pass@yizhioffer.com", "https://yizhioffer.com/path", "https://yizhioffer.com/?x=1", "https://yizhioffer.com/#x", "not a URL"])("未知/不安全 origin 拒绝：%s", base => {
  expect(() => getWatchaOAuthConfig(base)).toThrow(WatchaOAuthConfigurationError);
});
test("仅非生产允许 loopback 开发回调", () => {
  Object.assign(process.env, { NODE_ENV: "development" });
  expect(getWatchaOAuthConfig("http://localhost:3000").clientId).toBe("synthetic-legacy-id+/=");
  Object.assign(process.env, { NODE_ENV: "production" });
  expect(() => getWatchaOAuthConfig("http://localhost:3000")).toThrow(WatchaOAuthConfigurationError);
});
test("授权 URL 只含当前客户端 ID，不含任何 Secret", () => {
  const url = new URL(getWatchaAuthorizeUrl("synthetic-state", "https://yizhioffer.com"));
  expect(url.searchParams.get("client_id")).toBe("synthetic-yizhi-id+/=");
  expect(url.searchParams.get("redirect_uri")).toBe("https://yizhioffer.com/api/auth/watcha/callback");
  expect(url.searchParams.get("state")).toBe("synthetic-state");
  expect(url.href).not.toContain("secret");
});
test.each(["https://www.ai-job-coach.xin", "https://yizhioffer.com"])("换 token 与授权选择同一套配对，且只发观猹端点：%s", async base => {
  const mocked = jest.fn().mockResolvedValue({ json: async () => ({ access_token: "synthetic-token" }) });
  globalThis.fetch = mocked;
  await exchangeCodeForToken("synthetic-code", base);
  const [target, options] = mocked.mock.calls[0];
  const body = new URLSearchParams(options.body);
  const expected = getWatchaOAuthConfig(base);
  expect(target).toBe("https://watcha.cn/oauth/api/token");
  expect(body.get("client_id")).toBe(expected.clientId);
  expect(body.get("client_secret")).toBe(expected.clientSecret);
  expect(body.get("redirect_uri")).toBe(expected.redirectUri);
});
test("新域少一项密钥时，换 token 前即拒绝，不产生网络请求", async () => {
  delete process.env.WATCHA_YIZHI_CLIENT_SECRET;
  const mocked = jest.fn(); globalThis.fetch = mocked;
  await expect(exchangeCodeForToken("synthetic-code", "https://yizhioffer.com")).rejects.toThrow(WatchaOAuthConfigurationError);
  expect(mocked).not.toHaveBeenCalled();
});
test("移除旧应用凭据后，新域授权与 token 交换仍独立工作", async () => {
  delete process.env.WATCHA_CLIENT_ID;
  delete process.env.WATCHA_CLIENT_SECRET;
  const url = new URL(getWatchaAuthorizeUrl("synthetic-state", "https://yizhioffer.com"));
  expect(url.searchParams.get("redirect_uri")).toBe("https://yizhioffer.com/api/auth/watcha/callback");
  const mocked = jest.fn().mockResolvedValue({ json: async () => ({ access_token: "synthetic-token" }) });
  globalThis.fetch = mocked;
  await exchangeCodeForToken("synthetic-code", "https://yizhioffer.com");
  const body = new URLSearchParams(mocked.mock.calls[0][1].body);
  expect(body.get("client_id")).toBe("synthetic-yizhi-id+/=");
  expect(body.get("client_secret")).toBe("synthetic-yizhi-secret");
});
