import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getDbClient } from "./db";

const TOKENPAY_ORIGIN = "https://tokendance.space";
const TOKENPAY_PORTAL = `${TOKENPAY_ORIGIN}/portal/api/v1`;
export const TOKENPAY_APP_URL = process.env.TOKENPAY_APP_URL || "https://www.ai-job-coach.xin";
const REQUEST_TIMEOUT_MS = 15_000;

export type TokenPayRecoveryAction = "top_up_balance" | "reauthorize_api_key" | "api_key_quota";
export type TokenPayPaymentStatus = "pending" | "paid" | "failed" | "closed" | "refunded";

type BalanceResponse = {
  balance: { credits: number; credits_used: number; balance: number };
};

type PaymentSessionResponse = {
  session: {
    id: string;
    amount: number;
    status: TokenPayPaymentStatus;
    payment_url: string;
    status_url: string;
    expired_at: number;
    created_at: number;
    paid_at?: number;
  };
};

export class TokenPayError extends Error {
  status: number;
  recoveryAction?: TokenPayRecoveryAction;

  constructor(message: string, status = 500, recoveryAction?: TokenPayRecoveryAction) {
    super(message);
    this.name = "TokenPayError";
    this.status = status;
    this.recoveryAction = recoveryAction;
  }
}

function readEncryptionKey() {
  const configured = process.env.TOKENPAY_ENCRYPTION_KEY?.trim();
  if (!configured) throw new Error("TOKENPAY_ENCRYPTION_KEY is not configured");
  const key = /^[0-9a-f]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");
  if (key.length !== 32) throw new Error("TOKENPAY_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

export function encryptTokenPayKey(apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", readEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptTokenPayKey(payload: string) {
  const [version, ivValue, tagValue, encryptedValue, extra] = payload.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue || extra) {
    throw new Error("Invalid TokenPay credential envelope");
  }
  const decipher = createDecipheriv("aes-256-gcm", readEncryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function fingerprintTokenPayKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
}

export function createPkcePair() {
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createTokenPayState() {
  return randomBytes(32).toString("base64url");
}

export function buildTokenPayAuthorizeUrl(input: {
  callbackUrl: string;
  challenge: string;
  keyName?: string;
}) {
  const url = new URL("/auth", TOKENPAY_ORIGIN);
  url.searchParams.set("callback_url", input.callbackUrl);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("app_url", TOKENPAY_APP_URL);
  url.searchParams.set("key_name", input.keyName || "益职 TokenPay");
  return url.toString();
}

function recoveryActionFromHeaders(headers: Headers): TokenPayRecoveryAction | undefined {
  const value = headers.get("tokendance-recovery-action");
  return value === "top_up_balance" || value === "reauthorize_api_key" || value === "api_key_quota"
    ? value
    : undefined;
}

async function tokenPayFetch<T>(url: string, init: RequestInit & { apiKey?: string }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = new Headers(init.headers);
    if (init.apiKey) headers.set("Authorization", `Bearer ${init.apiKey}`);
    const response = await fetch(url, { ...init, headers, signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = null; }
    }
    if (!response.ok) {
      const errorBody = body as { error?: { message?: string } } | null;
      const recoveryAction = recoveryActionFromHeaders(response.headers);
      const fallback = recoveryAction === "top_up_balance"
        ? "TokenPay 余额不足"
        : recoveryAction === "reauthorize_api_key"
          ? "TokenPay 授权已失效"
          : recoveryAction === "api_key_quota"
            ? "TokenPay API Key 已达到周期额度"
            : "TokenPay 暂时不可用";
      throw new TokenPayError(errorBody?.error?.message || fallback, response.status, recoveryAction);
    }
    return body as T;
  } catch (error) {
    if (error instanceof TokenPayError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new TokenPayError("TokenPay 请求超时，请重试", 504);
    throw new TokenPayError("TokenPay 连接失败，请重试", 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function exchangeTokenPayCode(code: string, verifier: string) {
  const result = await tokenPayFetch<{ key?: string }>(`${TOKENPAY_PORTAL}/auth/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
  });
  if (!result?.key) throw new TokenPayError("TokenPay 没有返回 API Key，请重新授权", 502);
  return result.key;
}

export async function saveTokenPayConnection(userId: string, apiKey: string) {
  const client = await getDbClient();
  if (!client) throw new Error("Database unavailable");
  const now = new Date().toISOString();
  const { error } = await client.from("tokenpay_connections").upsert({
    user_id: userId,
    encrypted_api_key: encryptTokenPayKey(apiKey),
    key_fingerprint: fingerprintTokenPayKey(apiKey),
    status: "active",
    connected_at: now,
    updated_at: now,
  }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function getTokenPayCredential(userId: string) {
  const client = await getDbClient();
  if (!client) return null;
  const { data, error } = await client.from("tokenpay_connections")
    .select("encrypted_api_key, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "active") return null;
  return decryptTokenPayKey(String(data.encrypted_api_key));
}

export async function hasActiveTokenPayConnection(userId: string) {
  const client = await getDbClient();
  if (!client) return false;
  const { data, error } = await client.from("tokenpay_connections")
    .select("user_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    // Deploys can briefly run before the migration reaches production. In
    // that window, preserve the hosted quota path instead of breaking AI.
    if (error.code === "42P01" || error.code === "PGRST205") return false;
    throw error;
  }
  return Boolean(data);
}

async function updateStoredBalance(userId: string, body: BalanceResponse) {
  const client = await getDbClient();
  if (!client) throw new Error("Database unavailable");
  const now = new Date().toISOString();
  const { error } = await client.from("tokenpay_connections").update({
    credits_microyuan: body.balance.credits,
    credits_used_microyuan: body.balance.credits_used,
    balance_microyuan: body.balance.balance,
    status: "active",
    last_checked_at: now,
    updated_at: now,
  }).eq("user_id", userId);
  if (error) throw error;
}

export async function getTokenPayAccount(userId: string) {
  const client = await getDbClient();
  if (!client) throw new Error("Database unavailable");
  const { data, error } = await client.from("tokenpay_connections")
    .select("encrypted_api_key, key_fingerprint, status, connected_at, last_checked_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status === "disconnected") return { connected: false as const };

  const apiKey = decryptTokenPayKey(String(data.encrypted_api_key));
  try {
    const balance = await tokenPayFetch<BalanceResponse>(`${TOKENPAY_PORTAL}/user/balance`, { method: "GET", apiKey });
    await updateStoredBalance(userId, balance);
    return {
      connected: true as const,
      status: "active" as const,
      keyFingerprint: String(data.key_fingerprint),
      connectedAt: String(data.connected_at),
      checkedAt: new Date().toISOString(),
      balance: balance.balance,
    };
  } catch (error) {
    if (error instanceof TokenPayError && error.recoveryAction === "reauthorize_api_key") {
      await client.from("tokenpay_connections").update({ status: "reauthorize", updated_at: new Date().toISOString() }).eq("user_id", userId);
      return { connected: true as const, status: "reauthorize" as const, keyFingerprint: String(data.key_fingerprint), connectedAt: String(data.connected_at), checkedAt: data.last_checked_at ? String(data.last_checked_at) : null, balance: null };
    }
    throw error;
  }
}

export async function disconnectTokenPay(userId: string) {
  const client = await getDbClient();
  if (!client) throw new Error("Database unavailable");
  const { error } = await client.from("tokenpay_connections").update({
    encrypted_api_key: "disconnected",
    status: "disconnected",
    credits_microyuan: null,
    credits_used_microyuan: null,
    balance_microyuan: null,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  if (error) throw error;
}

function validatePaymentSession(body: PaymentSessionResponse) {
  const session = body?.session;
  if (!session?.id || !Number.isInteger(session.amount) || !Number.isFinite(session.expired_at)) {
    throw new TokenPayError("TokenPay 返回了无效的支付会话", 502);
  }
  const paymentUrl = new URL(session.payment_url);
  if (paymentUrl.protocol !== "https:") throw new TokenPayError("TokenPay 返回了不安全的付款链接", 502);
  return session;
}

async function savePaymentSession(userId: string, session: PaymentSessionResponse["session"]) {
  const client = await getDbClient();
  if (!client) throw new Error("Database unavailable");
  const { error } = await client.from("tokenpay_payment_sessions").upsert({
    id: session.id,
    user_id: userId,
    amount_yuan: session.amount,
    status: session.status,
    payment_url: session.payment_url,
    expired_at: new Date(session.expired_at * 1000).toISOString(),
    paid_at: session.paid_at ? new Date(session.paid_at * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw error;
}

export async function createTokenPayPaymentSession(userId: string, amount: number) {
  if (!Number.isInteger(amount) || amount < 1 || amount > 100_000) {
    throw new TokenPayError("充值金额必须是 1 到 100000 元的整数", 400);
  }
  const apiKey = await getTokenPayCredential(userId);
  if (!apiKey) throw new TokenPayError("请先连接 TokenPay", 409, "reauthorize_api_key");
  const body = await tokenPayFetch<PaymentSessionResponse>(`${TOKENPAY_PORTAL}/payment/sessions`, {
    method: "POST",
    apiKey,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  const session = validatePaymentSession(body);
  await savePaymentSession(userId, session);
  return session;
}

export async function getTokenPayPaymentSession(userId: string, sessionId: string) {
  if (!/^[a-zA-Z0-9_-]{6,180}$/.test(sessionId)) throw new TokenPayError("支付会话 ID 无效", 400);
  const client = await getDbClient();
  if (!client) throw new Error("Database unavailable");
  const { data, error } = await client.from("tokenpay_payment_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new TokenPayError("支付会话不存在", 404);
  const apiKey = await getTokenPayCredential(userId);
  if (!apiKey) throw new TokenPayError("请重新连接 TokenPay", 409, "reauthorize_api_key");
  const body = await tokenPayFetch<PaymentSessionResponse>(`${TOKENPAY_PORTAL}/payment/sessions/${encodeURIComponent(sessionId)}`, { method: "GET", apiKey });
  const session = validatePaymentSession(body);
  await savePaymentSession(userId, session);
  if (session.status === "paid") await getTokenPayAccount(userId);
  return session;
}

export function microyuanToYuan(value: number) {
  return Math.max(0, value) / 1_000_000;
}
