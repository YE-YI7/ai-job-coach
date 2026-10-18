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

function rejectProvider(code: unknown): never {
  // Do not log SDK exceptions: they can contain signed requests, phone numbers or OTPs.
  const limited = code === "FREQUENCY_FAIL" || code === "BUSINESS_LIMIT_CONTROL";
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
    if (response.body?.code !== "OK" || response.body.success !== true) rejectProvider(response.body?.code);
  } catch (error) {
    if (error instanceof SmsProviderError) throw error;
    rejectProvider((error as { code?: unknown })?.code);
  }
}

export async function checkPhoneCode(phone: string, purpose: PhonePurpose, challengeId: string, code: string) {
  try {
    const response = await client().checkSmsVerifyCodeWithOptions(new CheckSmsVerifyCodeRequest({
      phoneNumber: phone.slice(3), countryCode: "86", schemeName: scheme(purpose), outId: challengeId,
      verifyCode: code, caseAuthPolicy: 1,
    }), runtime());
    if (response.body?.code !== "OK" || response.body.success !== true) rejectProvider(response.body?.code);
    return response.body.model?.verifyResult === "PASS";
  } catch (error) {
    if (error instanceof SmsProviderError) throw error;
    rejectProvider((error as { code?: unknown })?.code);
  }
}
