const mockSend = jest.fn();
const mockCheck = jest.fn();
jest.mock("@alicloud/dypnsapi20170525", () => ({
  __esModule: true,
  default: class { sendSmsVerifyCodeWithOptions = mockSend; checkSmsVerifyCodeWithOptions = mockCheck; },
  SendSmsVerifyCodeRequest: class { constructor(values: object) { Object.assign(this, values); } },
  CheckSmsVerifyCodeRequest: class { constructor(values: object) { Object.assign(this, values); } },
}));
import { checkPhoneCode, sendPhoneCode, phoneAuthConfigured } from "./provider";

beforeEach(() => {
  jest.clearAllMocks();
  process.env.PHONE_AUTH_ENABLED = "1";
  process.env.ALIYUN_PNVS_ACCESS_KEY_ID = "test-only-not-a-key";
  process.env.ALIYUN_PNVS_ACCESS_KEY_SECRET = "test-only-not-a-secret";
  mockSend.mockResolvedValue({ body: { code: "OK", success: true } });
});
test("fails closed without credentials or the explicit switch", () => {
  delete process.env.PHONE_AUTH_ENABLED;
  expect(phoneAuthConfigured()).toBe(false);
});
test("lets the provider generate and check OTP without returning or retrying sends", async () => {
  await sendPhoneCode("+8613800138000", "bind", "challenge");
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: "13800138000", countryCode: "86",
    schemeName: "yizhi-bind-v1", outId: "challenge", templateCode: "100004", codeLength: 6,
    templateParam: '{"code":"##code##","min":"5"}', returnVerifyCode: false, autoRetry: 0 }),
    expect.objectContaining({ autoretry: false, connectTimeout: 5000, readTimeout: 10000 }));
});
test.each([undefined, "UNKNOWN", "pass", "FAIL"])("HTTP OK is not proof of a valid OTP: %s", async verifyResult => {
  mockCheck.mockResolvedValue({ body: { code: "OK", success: true, model: { verifyResult } } });
  expect(await checkPhoneCode("+8613800138000", "login", "challenge", "123456")).toBe(false);
});
test("accepts only PASS from the exact same purpose, phone and OutId", async () => {
  mockCheck.mockResolvedValue({ body: { code: "OK", success: true, model: { verifyResult: "PASS" } } });
  expect(await checkPhoneCode("+8613800138000", "login", "challenge", "123456")).toBe(true);
  expect(mockCheck).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: "13800138000", schemeName: "yizhi-login-v1", outId: "challenge" }), expect.anything());
});
test("does not propagate SDK errors containing request secrets", async () => {
  mockSend.mockRejectedValue(new Error("request-secret-and-phone"));
  await expect(sendPhoneCode("+8613800138000", "login", "challenge")).rejects.toThrow("短信认证暂时不可用");
});
