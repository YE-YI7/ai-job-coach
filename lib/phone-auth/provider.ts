import "server-only";
import Client, { CheckSmsVerifyCodeRequest, SendSmsVerifyCodeRequest } from "@alicloud/dypnsapi20170525";
import { $OpenApiUtil } from "@alicloud/openapi-core";
import { RuntimeOptions } from "@darabonba/typescript";
import type { PhonePurpose } from "./identity";

export function phoneAuthConfigured() {
  return process.env.PHONE_AUTH_ENABLED === "1"
    && Boolean(process.env.ALIYUN_PNVS_ACCESS_KEY_ID?.trim())
    && Boolean(process.env.ALIYUN_PNVS_ACCESS_KEY_SECRET?.trim());
}

export function smsSignName() {
  return process.env.ALIYUN_PNVS_SIGN_NAME?.trim() || "恒创联众";
}

function client() {
  if (!phoneAuthConfigured()) throw new Error("PHONE_AUTH_UNAVAILABLE");
  return new Client(new $OpenApiUtil.Config({
    accessKeyId: process.env.ALIYUN_PNVS_ACCESS_KEY_ID!.trim(),
    accessKeySecret: process.env.ALIYUN_PNVS_ACCESS_KEY_SECRET!.trim(),
    endpoint: "dypnsapi.aliyuncs.com",
    regionId: "cn-hangzhou",
  }));
}

const runtime = () => new RuntimeOptions({ autoretry: false, connectTimeout: 5000, readTimeout: 10000 });
const scheme = (purpose: PhonePurpose) => `yizhi-${purpose}-v1`;

export class SmsProviderError extends Error {
  constructor(public readonly kind: "limited" | "unavailable") {
    super("短信认证暂时不可用");
  }
}

// 只记录文档中的状态枚举，不记录 SDK 异常、message、请求或响应正文。
const limitedCodes = new Set([
  "FREQUENCY_FAIL", "BUSINESS_LIMIT_CONTROL", "biz.FREQUENCY", "isv.BUSINESS_LIMIT_CONTROL",
  "LimitExceeded.SmsCode", "isp.QPS_LIMIT", "Throttling", "Throttling.User", "Throttling.Api",
]);
const diagnosticCodes = new Set([
  ...limitedCodes, "INVALID_PARAMETERS", "isv.INVALID_PARAMETERS", "InvalidParameter.SmsTemplateCode",
  "EntityNotExist.SmsTemplateCode", "EntityNotExist.SmsSignName", "FUNCTION_NOT_OPENED",
  "isv.PRODUCT_UNSUBSCRIBE", "isv.PRODUCT_UN_SUBSCRIPT", "isv.RAM_PERMISSION_DENY",
  "isp.RAM_PERMISSION_DENY", "isv.FORBIDDEN_ACTION", "isv.OUT_OF_SERVICE", "isv.ACCOUNT_ABNORMAL",
  "InvalidAccessKeyId.NotFound", "InvalidAccessKeyId.Inactive", "SignatureDoesNotMatch",
  "isp.UNKNOWN", "isp.SYSTEM_ERROR", "SYSTEM_ERROR", "SDK.TimeoutError", "ETIMEDOUT",
  "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "ReadTimeout", "ConnectTimeout",
]);

function rejectProvider(code: unknown, operation: "send" | "check", purpose: PhonePurpose, requestId?: unknown): never {
  const safeCode = typeof code === "string" && diagnosticCodes.has(code) ? code : "UNRECOGNIZED";
  const safeRequestId = typeof requestId === "string" && /^[0-9a-f-]{16,64}$/i.test(requestId) ? requestId : undefined;
  console.warn("phone_auth_provider_failure", { operation, purpose, code: safeCode,
    ...(safeRequestId ? { requestId: safeRequestId } : {}) });
  const limited = typeof code === "string" && limitedCodes.has(code);
  throw new SmsProviderError(limited ? "limited" : "unavailable");
}

export async function sendPhoneCode(phone: string, purpose: PhonePurpose, challengeId: string) {
  try {
    const response = await client().sendSmsVerifyCodeWithOptions(new SendSmsVerifyCodeRequest({
      phoneNumber: phone.slice(3), countryCode: "86", schemeName: scheme(purpose), outId: challengeId,
      signName: smsSignName(),
      templateCode: purpose === "bind"
        ? (process.env.ALIYUN_PNVS_BIND_TEMPLATE || "100004")
        : (process.env.ALIYUN_PNVS_LOGIN_TEMPLATE || "100001"),
      templateParam: JSON.stringify({ code: "##code##", min: "5" }),
      codeLength: 6, codeType: 1, validTime: 300, interval: 60,
      duplicatePolicy: 1, returnVerifyCode: false, autoRetry: 0,
    }), runtime());
    if (response.body?.code !== "OK" || response.body.success !== true)
      rejectProvider(response.body?.code, "send", purpose, response.body?.requestId);
  } catch (error) {
    if (error instanceof SmsProviderError) throw error;
    const sdkError = error as { code?: unknown; data?: { RequestId?: unknown } };
    rejectProvider(sdkError?.code, "send", purpose, sdkError?.data?.RequestId);
  }
}

export async function checkPhoneCode(phone: string, purpose: PhonePurpose, challengeId: string, code: string) {
  try {
    const response = await client().checkSmsVerifyCodeWithOptions(new CheckSmsVerifyCodeRequest({
      phoneNumber: phone.slice(3), countryCode: "86", schemeName: scheme(purpose), outId: challengeId,
      verifyCode: code, caseAuthPolicy: 1,
    }), runtime());
    if (response.body?.code !== "OK" || response.body.success !== true)
      rejectProvider(response.body?.code, "check", purpose, response.body?.requestId);
    return response.body.model?.verifyResult === "PASS";
  } catch (error) {
    if (error instanceof SmsProviderError) throw error;
    const sdkError = error as { code?: unknown; data?: { RequestId?: unknown } };
    rejectProvider(sdkError?.code, "check", purpose, sdkError?.data?.RequestId);
  }
}
