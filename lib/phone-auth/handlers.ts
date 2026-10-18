import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { createSessionToken, sessionCookie } from "@/lib/session";
import { isPhonePurpose, maskPhone, normalizeMainlandPhone, type PhonePurpose } from "./identity";
import { checkPhoneCode, phoneAuthConfigured, sendPhoneCode, SmsProviderError, smsSignName } from "./provider";
import { isSameOriginRequest, phoneCookie, phoneHash, phoneIpHash } from "./security";

type Db = NonNullable<Awaited<ReturnType<typeof getDbClient>>>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200, headers: Record<string,string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private", ...headers } });
const error = (message: string, status = 400, code = "invalid") => json({ ok: false, error: message, code }, status);
const unavailable = () => error("短信认证暂时不可用，请稍后重试；原登录方式仍可使用。", 503, "unavailable");

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > 2048) throw new Error("invalid");
  const raw = await request.text();
  if (raw.length > 2048) throw new Error("invalid");
  const body = JSON.parse(raw);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
  return body;
}

async function limit(db: Db, scope: string, key: string, count: number, window: number) {
  const { data, error: dbError } = await db.rpc("consume_public_action_rate_limit", {
    p_scope: `phone-${scope}`, p_key_hash: key, p_window_seconds: window, p_limit: count,
  });
  if (dbError) throw new Error("PHONE_AUTH_DB_UNAVAILABLE");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== "boolean") throw new Error("PHONE_AUTH_DB_UNAVAILABLE");
  return row.allowed ? null : json({ ok: false, error: "操作较频繁，请等倒计时结束后重试。", code: "limited", reason: "short" }, 429,
    { "Retry-After": String(Math.max(1, Number(row.retry_after_seconds) || window)) });
}

async function rpc(db: Db, name: string, args: Record<string, unknown>) {
  const { data, error: dbError } = await db.rpc(name, args);
  if (dbError || !data?.status) throw new Error("PHONE_AUTH_DB_UNAVAILABLE");
  return data;
}

function resultError(status: string) {
  if (status === "original_account_required") return error("请先用原来的观猹、邮箱或邀请码登录，再关联手机号。", 409, status);
  if (status === "account_has_data") return error("这个号码的账号已有资料或额度，不能自动关联。两个账号的资料都已保留，请先联系支持核对。", 409, status);
  if (status === "busy") return error("正在验证，请稍等片刻再试。", 409, status);
  if (status === "cooldown") return json({ ok: false, error: "请在一分钟后重新获取验证码。", code: status }, 429, { "Retry-After": "60" });
  if (status === "unauthorized") return error("登录已失效，请用原方式重新登录后绑定。", 401, status);
  if (status === "already_bound") return error("当前账号已绑定手机号。为保护账号安全，暂不支持在此更换。", 409, status);
  if (status === "conflict") return error("这个手机号已用于其他账号。未合并账号，也未修改当前资料；请换一个号码。", 409, status);
  if (status === "incorrect") return error("验证码不正确或已过期，请核对短信，或重新获取。", 400, status);
  return error("这次验证已失效，请重新获取验证码。", 410, "expired");
}

function clientToken(request: NextRequest) {
  const token = request.cookies.get(phoneCookie.name)?.value;
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

/** Returns masked data only. A reload may resume this browser's pending challenge. */
export async function phoneStatus(request: NextRequest) {
  const purpose = request.nextUrl.searchParams.get("purpose") || "login";
  if (!isPhonePurpose(purpose)) return error("验证用途不正确。");
  const enabled = phoneAuthConfigured();
  const user = await getCurrentUserFromRequest();
  if (purpose === "bind" && !user) return resultError("unauthorized");
  try {
    const db = await getDbClient();
    if (!db) return unavailable();
    let boundPhone: string | null = null;
    if (user) {
      const { data, error: dbError } = await db.from("users").select("phone").eq("id", user.id).single();
      if (dbError || !data) return resultError("unauthorized");
      boundPhone = data.phone ? maskPhone(data.phone) : null;
    }
    let pending = null;
    const token = clientToken(request) || (enabled ? randomBytes(32).toString("base64url") : null);
    if (enabled && token && !(purpose === "login" && user)) {
      let query = db.from("phone_auth_challenges").select("id,phone,created_at,expires_at,allow_recovery")
        .eq("client_hash", phoneHash("browser", token)).eq("purpose", purpose)
        .in("state", ["sent", "checking"]).gt("expires_at", new Date().toISOString())
        .lt("attempts", 5).order("created_at", { ascending: false }).limit(1);
      query = purpose === "bind" ? query.eq("user_id", user!.id) : query.is("user_id", null);
      const { data, error: dbError } = await query;
      if (dbError) return unavailable();
      if (data?.[0]) pending = {
        challengeId: data[0].id, maskedPhone: maskPhone(data[0].phone), expiresAt: data[0].expires_at, recovery: data[0].allow_recovery === true,
        resendAt: new Date(Date.parse(data[0].created_at) + 60_000).toISOString(),
      };
    }
    const response = json({ ok: true, enabled, boundPhone, authenticated: Boolean(user), pending, signName: smsSignName() });
    // Issue browser proof before sending SMS, so a lost send response can be resumed.
    if (enabled && token) response.cookies.set(phoneCookie.name, token, phoneCookie.options);
    return response;
  } catch { return unavailable(); }
}

async function context(request: NextRequest) {
  if (!isSameOriginRequest(request)) return { response: error("请从当前益职页面重新发起验证。", 403, "origin") };
  if (!phoneAuthConfigured()) return { response: unavailable() };
  let body: Record<string, unknown>;
  try { body = await readBody(request); } catch { return { response: error("验证信息格式不正确。") }; }
  if (!isPhonePurpose(body.purpose)) return { response: error("请选择登录或绑定。") };
  const purpose: PhonePurpose = body.purpose;
  if (body.recovery === true && purpose !== "bind") return { response: error("关联手机号需要先登录原账号。", 400, "invalid") };
  const user = await getCurrentUserFromRequest();
  if (purpose === "bind" && !user) return { response: resultError("unauthorized") };
  if (purpose === "login" && user) return { response: error("你已登录。如需将手机号用于当前账号，请进入账号设置绑定。", 409, "use_binding") };
  const db = await getDbClient();
  if (!db) return { response: unavailable() };
  return { body, purpose, user, db };
}

export async function phoneSend(request: NextRequest) {
  try {
    const ctx = await context(request);
    if (ctx.response) return ctx.response;
    const { body, db, purpose, user } = ctx;
    const phone = normalizeMainlandPhone(body.phone);
    if (!phone) return error("请输入中国大陆 11 位手机号（+86）。");
    if (body.consent !== true) return error("请先确认接收用于本次验证的短信。");
    // Request-abuse cap remains before admission; SMS caps are reserved atomically
    // with admission so cooldown clicks cannot consume the daily SMS allowance.
    const blocked = await limit(db, "send-ip", phoneIpHash(request), 10, 900);
    if (blocked) return blocked;
    const browserToken = clientToken(request) || randomBytes(32).toString("base64url");
    const challengeId = randomUUID();
    const begun = await rpc(db, "reserve_phone_auth_send", {
      p_id: challengeId, p_phone: phone, p_purpose: purpose, p_user_id: user?.id || null,
      p_client_hash: phoneHash("browser", browserToken),
      p_number_hash: phoneHash("number", phone), p_global_hash: phoneHash("global", "all"), p_recovery: body.recovery === true,
    });
    if (begun.status === "limited") return json({ ok: false, code: "limited", reason: begun.limit_scope === "number" ? "daily" : "service",
      error: begun.limit_scope === "number" ? "今日验证码次数已用完，可使用其他登录方式。" : "今日短信服务额度已用完，可使用其他登录方式。" },
      429, { "Retry-After": String(Math.max(1, Math.min(86400, Number(begun.retry_after_seconds) || 86400))) });
    if (begun.status !== "ready") return resultError(begun.status);
    try {
      await sendPhoneCode(phone, purpose, challengeId);
    } catch (cause) {
      await db.from("phone_auth_challenges").update({ state: "failed" }).eq("id", challengeId).eq("state", "sending");
      if (cause instanceof SmsProviderError && cause.kind === "limited") return json({ ok: false,
        error: "短信服务已限制本次发送，请稍后再试，或使用原登录方式。", code: "provider_limited" }, 429, { "Retry-After": "60" });
      return unavailable();
    }
    const { data, error: dbError } = await db.from("phone_auth_challenges").update({ state: "sent" })
      .eq("id", challengeId).eq("state", "sending").select("created_at,expires_at").single();
    if (dbError || !data) return unavailable();
    const response = json({ ok: true, challengeId, maskedPhone: maskPhone(phone), signName: smsSignName(), recovery: body.recovery === true,
      expiresAt: data.expires_at, resendAt: new Date(Date.parse(data.created_at) + 60_000).toISOString() });
    response.cookies.set(phoneCookie.name, browserToken, phoneCookie.options);
    return response;
  } catch { return unavailable(); }
}

export async function phoneVerify(request: NextRequest) {
  try {
    const ctx = await context(request);
    if (ctx.response) return ctx.response;
    const { body, db, purpose, user } = ctx;
    if (typeof body.challengeId !== "string" || !uuid.test(body.challengeId)
      || typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) return error("请输入六位短信验证码。");
    const token = clientToken(request);
    if (!token) return resultError("expired");
    const blocked = await limit(db, "verify-ip", phoneIpHash(request), 30, 900);
    if (blocked) return blocked;
    const args = { p_id: body.challengeId, p_purpose: purpose, p_user_id: user?.id || null,
      p_client_hash: phoneHash("browser", token), p_attempt_id: randomUUID() };
    const claim = await rpc(db, "claim_phone_auth", args);
    if (claim.status !== "ready") return resultError(claim.status);
    let outcome = "error";
    try { outcome = await checkPhoneCode(claim.phone, purpose, body.challengeId, body.code) ? "pass" : "fail"; }
    catch { /* The persistent lease also recovers a function crash. No raw errors/OTP logs. */ }
    const result = await rpc(db, body.recovery === true ? "finish_phone_recovery" : "finish_phone_auth", { ...args, p_outcome: outcome });
    if (result.status === "unavailable") return unavailable();
    if (result.status !== "ok") return resultError(result.status);
    const response = json({ ok: true, userId: result.user_id, isNewUser: result.is_new_user,
      ...(purpose === "bind" ? { boundPhone: maskPhone(claim.phone) } : {}) });
    if (purpose === "login") {
      response.cookies.set(sessionCookie.name, await createSessionToken(result.user_id, result.email || undefined), sessionCookie.options);
      response.cookies.set("sb-session-user-id", "", { ...sessionCookie.options, maxAge: 0 });
    }
    response.cookies.set(phoneCookie.name, "", { ...phoneCookie.options, maxAge: 0 });
    return response;
  } catch { return unavailable(); }
}
