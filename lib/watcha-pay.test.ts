import { consumeWatchaPaySandboxQuota, getWatchaPayAccess, parseWatchaPayAccess, watchaPayConfiguration } from "./watcha-pay";

const variables = ["WATCHA_PAY_ENVIRONMENT", "WATCHA_PAY_API_KEY", "WATCHA_PAY_CHAT_ENTITLEMENT_ID", "WATCHA_PAY_LIVE_ENABLED"];
const previous = Object.fromEntries(variables.map(key => [key, process.env[key]]));
const oldFetch = global.fetch;
const fetchMock = jest.fn();
const valid = { access: "granted", entitlement: { type: "quota", remaining: 4 }, purchase: { url: "https://render.alipay.com/nowpay/buy?p=test" } };
function configure() {
  process.env.WATCHA_PAY_ENVIRONMENT = "sandbox";
  process.env.WATCHA_PAY_API_KEY = "wpay_test_synthetic";
  process.env.WATCHA_PAY_CHAT_ENTITLEMENT_ID = "ent_test";
}
beforeEach(() => { variables.forEach(key => delete process.env[key]); fetchMock.mockReset(); global.fetch = fetchMock; });
afterAll(() => {
  variables.forEach(key => { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; });
  global.fetch = oldFetch;
});

it("does not call the provider or invent a purchase URL when unconfigured", async () => {
  expect(await getWatchaPayAccess("u1", "chat")).toEqual({ configured: false, channel: "alipay" });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("requires an explicit live gate and matching key", () => {
  configure(); process.env.WATCHA_PAY_ENVIRONMENT = "live";
  expect(watchaPayConfiguration("chat")).toBeNull();
  process.env.WATCHA_PAY_LIVE_ENABLED = "true";
  expect(() => watchaPayConfiguration("chat")).toThrow();
  process.env.WATCHA_PAY_API_KEY = "wpay_live_synthetic";
  expect(watchaPayConfiguration("chat")?.environment).toBe("live");
});
it("keeps stable buyer identity server-side and strips unexpected provider fields", async () => {
  configure(); fetchMock.mockResolvedValue(Response.json({ ...valid, secret: "must-not-return" }));
  const account = await getWatchaPayAccess("u1", "chat");
  expect(account).toMatchObject({ configured: true, environment: "sandbox", channel: "alipay", result: valid });
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("https://pay.watcha.cn/v1/entitlements/access");
  expect(options.redirect).toBe("error");
  expect(options.cache).toBe("no-store");
  expect(JSON.parse(options.body)).toEqual({ entitlement_id: "ent_test", user_id: "u1" });
  expect(JSON.stringify(account)).not.toContain("wpay_test_");
});
it("generates a local PNG QR for a validated checkout when the provider omits it", async () => {
  configure(); fetchMock.mockResolvedValue(Response.json({ ...valid, purchase: { url: "alipays://platformapi/startapp?appId=20000067&url=synthetic" } }));
  const account = await getWatchaPayAccess("u1", "chat");
  if (!account.configured || account.result.access === "unavailable") throw new Error("expected checkout");
  expect(account.result.purchase.qrUrl).toMatch(/^data:image\/png;base64,/);
  const png = Buffer.from(account.result.purchase.qrUrl!.split(',')[1], 'base64');
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("keeps official QR images and never locally encodes an untrusted payment URL", async () => {
  configure(); fetchMock.mockResolvedValue(Response.json({ ...valid, purchase: { ...valid.purchase, qr_url: "https://mobilecodec.alipay.com/show.htm?code=synthetic" } }));
  expect(await getWatchaPayAccess("u1", "chat")).toMatchObject({ result: { purchase: { qrUrl: "https://mobilecodec.alipay.com/show.htm?code=synthetic" } } });
  fetchMock.mockResolvedValue(Response.json({ ...valid, purchase: { url: "https://evil.example/pay" } }));
  await expect(getWatchaPayAccess("u1", "chat")).rejects.toMatchObject({ code: "invalid_purchase_url" });
});
it("treats access as a classification, not proof of quota reservation", () => {
  expect(parseWatchaPayAccess({ ...valid, access: "purchase_required", entitlement: { type: "quota", remaining: 4 } })).toMatchObject({ entitlement: { type: "quota", remaining: 4 } });
});
it.each(["javascript:alert(1)", "https://evil.example/pay", "https://render.alipay.com.evil.example/pay", "https://user:pass@render.alipay.com/pay", "http://render.alipay.com/pay", "alipays://evil/pay"])("rejects unsafe checkout URL %s", url => {
  expect(() => parseWatchaPayAccess({ ...valid, purchase: { url } })).toThrow();
});
it("supports the official mobile Alipay scheme", () => {
  expect(parseWatchaPayAccess({ ...valid, purchase: { url: "alipays://platformapi/startapp?appId=20000067" } })).toMatchObject({ purchase: { url: "alipays://platformapi/startapp?appId=20000067" } });
});
it('preserves the official desktop QR image and rejects untrusted QR URLs', () => {
  expect(parseWatchaPayAccess({...valid,purchase:{...valid.purchase,qr_url:'https://mobilecodec.alipay.com/show.htm?code=synthetic'}})).toMatchObject({purchase:{qrUrl:'https://mobilecodec.alipay.com/show.htm?code=synthetic'}});
  expect(()=>parseWatchaPayAccess({...valid,purchase:{...valid.purchase,qr_url:'https://evil.example/qr'}})).toThrow();
});
it.each([
  { ...valid, access: "unknown" },
  { ...valid, entitlement: { type: "permanent" } },
  { ...valid, entitlement: { type: "quota", remaining: -1 } },
  { ...valid, entitlement: { type: "quota", remaining: 1.2 } },
  { ...valid, purchase: null },
  { access: "unavailable", reason: { code: "unknown" } },
])("fails closed on unknown or malformed response %#", data => { expect(() => parseWatchaPayAccess(data)).toThrow(); });
it("does not echo a provider error or secret", async () => {
  configure(); fetchMock.mockResolvedValue(Response.json({ error: "wpay_test_secret" }, { status: 500 }));
  await expect(getWatchaPayAccess("u1", "chat")).rejects.toMatchObject({ code: "provider_error" });
});
it("does not turn network failure into granted access", async () => {
  configure(); fetchMock.mockRejectedValue(new Error("secret transport error"));
  await expect(getWatchaPayAccess("u1", "chat")).rejects.toMatchObject({ code: "transport_error" });
});
it("uses the same debit identity on an exact retry, different identity for another buyer", async () => {
  configure(); fetchMock.mockImplementation(async () => Response.json({ consumed: 1, entitlement: { type: "quota", remaining: 3 } }));
  await consumeWatchaPaySandboxQuota("u1", "chat", "operation1");
  await consumeWatchaPaySandboxQuota("u1", "chat", "operation1");
  await consumeWatchaPaySandboxQuota("u2", "chat", "operation1");
  const bodies = fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body));
  expect(bodies[0].idempotency_key).toBe(bodies[1].idempotency_key);
  expect(bodies[0].idempotency_key).not.toBe(bodies[2].idempotency_key);
});
it("blocks the probe from making any live debit", async () => {
  configure(); process.env.WATCHA_PAY_ENVIRONMENT = "live"; process.env.WATCHA_PAY_LIVE_ENABLED = "true"; process.env.WATCHA_PAY_API_KEY = "wpay_live_synthetic";
  await expect(consumeWatchaPaySandboxQuota("u1", "chat", "op1")).rejects.toMatchObject({ code: "sandbox_only" });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("recognizes only the documented insufficient quota response", async () => {
  configure(); fetchMock.mockResolvedValue(Response.json({ error: { code: "insufficient_quota" } }, { status: 409 }));
  await expect(consumeWatchaPaySandboxQuota("u1", "chat", "op1")).rejects.toMatchObject({ code: "insufficient_quota" });
  fetchMock.mockResolvedValue(Response.json({ error: { code: "unknown" } }, { status: 409 }));
  await expect(consumeWatchaPaySandboxQuota("u1", "chat", "op1")).rejects.toMatchObject({ code: "provider_error" });
});
it("does not accept an ambiguous successful debit", async () => {
  configure(); fetchMock.mockResolvedValue(Response.json({ consumed: 2, entitlement: { type: "quota", remaining: 3 } }));
  await expect(consumeWatchaPaySandboxQuota("u1", "chat", "op1")).rejects.toMatchObject({ code: "ambiguous_consume_response" });
});
