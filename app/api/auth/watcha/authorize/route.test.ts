import { GET } from "./route";

const keys = ["WATCHA_CLIENT_ID", "WATCHA_CLIENT_SECRET", "WATCHA_YIZHI_CLIENT_ID", "WATCHA_YIZHI_CLIENT_SECRET"] as const;
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
beforeEach(() => {
  process.env.WATCHA_CLIENT_ID = "synthetic-legacy-id";
  process.env.WATCHA_CLIENT_SECRET = "synthetic-legacy-secret";
  process.env.WATCHA_YIZHI_CLIENT_ID = "synthetic-yizhi-id";
  process.env.WATCHA_YIZHI_CLIENT_SECRET = "synthetic-yizhi-secret";
});
afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});
test.each([["https://www.ai-job-coach.xin", "synthetic-legacy-id"], ["https://yizhioffer.com", "synthetic-yizhi-id"]])("%s 正确授权并设置原有安全 cookie", async (base, id) => {
  const response = await GET(new Request(`${base}/api/auth/watcha/authorize?redirect=%2Fadmin%2Fevals`));
  const url = new URL(response.headers.get("location")!);
  expect(url.origin).toBe("https://watcha.cn");
  expect(url.searchParams.get("client_id")).toBe(id);
  expect(url.searchParams.get("state")).toMatch(/^[0-9a-f]{64}$/);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("watcha_oauth_redirect=%2Fadmin%2Fevals");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
test("新域未填完整时回当前登录页，不发旧应用授权，也不设置一次性 state", async () => {
  delete process.env.WATCHA_YIZHI_CLIENT_SECRET;
  const response = await GET(new Request("https://yizhioffer.com/api/auth/watcha/authorize?redirect=%2Fadmin%2Fevals"));
  const url = new URL(response.headers.get("location")!);
  expect(url.origin).toBe("https://yizhioffer.com");
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("redirect")).toBe("/admin/evals");
  expect(url.searchParams.get("error")).toContain("暂未配置");
  expect(response.headers.get("set-cookie")).toBeNull();
});
test("未知 origin 返回 400，不跳观猹或外站、不设置 cookie", async () => {
  const response = await GET(new Request("https://attacker.invalid/api/auth/watcha/authorize"));
  expect(response.status).toBe(400);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("set-cookie")).toBeNull();
});
