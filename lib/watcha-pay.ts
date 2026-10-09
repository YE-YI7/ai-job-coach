/** Server-side only. Do not expose credentials or trust browser-supplied buyer IDs. */
import { createHash } from "node:crypto";

export type WatchaPayCapability = "chat" | "resume" | "interview";
type Environment = "sandbox" | "live";
type Configuration = { environment: Environment; key: string; entitlementId: string };
export type WatchaPayAccess =
  | { access: "unavailable"; reason: "configuration_action_required" }
  | { access: "granted" | "purchase_required"; entitlement: { type: "quota"; remaining: number }; purchase: { url: string; qrUrl?: string } };

export class WatchaPayError extends Error {
  constructor(public readonly code: string, public readonly status = 503) {
    super("爱猹收暂不可用，请稍后重试；未确认支付或额度到账");
  }
}

export function watchaPayConfiguration(capability: WatchaPayCapability): Configuration | null {
  const environment = process.env.WATCHA_PAY_ENVIRONMENT;
  if (!environment) return null;
  if (environment !== "sandbox" && environment !== "live") throw new WatchaPayError("invalid_environment");
  // Live requires an explicit, separate operational gate after merchant/product acceptance.
  if (environment === "live" && process.env.WATCHA_PAY_LIVE_ENABLED !== "true") return null;
  const key = process.env.WATCHA_PAY_API_KEY?.trim();
  const entitlementId = process.env[`WATCHA_PAY_${capability.toUpperCase()}_ENTITLEMENT_ID`]?.trim();
  if (!key || !entitlementId) return null;
  if (!key.startsWith(environment === "sandbox" ? "wpay_test_" : "wpay_live_")) {
    throw new WatchaPayError("environment_key_mismatch");
  }
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(entitlementId)) throw new WatchaPayError("invalid_entitlement_id");
  return { environment, key, entitlementId };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WatchaPayError("invalid_response", 502);
  return value as Record<string, unknown>;
}

function purchaseUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 8192) throw new WatchaPayError("invalid_purchase_url", 502);
  let url: URL;
  try { url = new URL(value); } catch { throw new WatchaPayError("invalid_purchase_url", 502); }
  const permitted = url.protocol === "https:" &&
    (url.hostname === "pay.watcha.cn" || url.hostname === "render.alipay.com" || url.hostname === "mobilecodec.alipay.com") ||
    url.protocol === "alipays:" && url.hostname === "platformapi";
  if (!permitted || url.username || url.password || url.port || /[\r\n]/.test(value)) {
    throw new WatchaPayError("invalid_purchase_url", 502);
  }
  return url.href;
}

export function parseWatchaPayAccess(value: unknown): WatchaPayAccess {
  const data = record(value);
  if (data.access === "unavailable") {
    if (record(data.reason).code !== "configuration_action_required") throw new WatchaPayError("unknown_reason", 502);
    return { access: "unavailable", reason: "configuration_action_required" };
  }
  if (data.access !== "granted" && data.access !== "purchase_required") throw new WatchaPayError("unknown_access", 502);
  const entitlement = record(data.entitlement);
  if (entitlement.type !== "quota" || !Number.isSafeInteger(entitlement.remaining) || (entitlement.remaining as number) < 0) {
    throw new WatchaPayError("invalid_quota", 502);
  }
  return {
    access: data.access,
    entitlement: { type: "quota", remaining: entitlement.remaining as number },
    purchase: { url: purchaseUrl(record(data.purchase).url),
      ...(record(data.purchase).qr_url ? { qrUrl: purchaseUrl(record(data.purchase).qr_url) } : {}) },
  };
}

async function request(config: Configuration, path: "access" | "consume", body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch(`https://pay.watcha.cn/v1/entitlements/${path}`, {
      method: "POST", cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ entitlement_id: config.entitlementId, ...body }),
    });
  } catch { throw new WatchaPayError("transport_error"); }
  if (!response.ok) {
    // Only a documented insufficient_quota is treated as no debit. Unknown 409 is ambiguous.
    if (path === "consume" && response.status === 409) {
      const payload = await response.json().catch(() => null);
      if (payload?.error?.code === "insufficient_quota") throw new WatchaPayError("insufficient_quota", 409);
    }
    throw new WatchaPayError("provider_error");
  }
  return response.json().catch(() => { throw new WatchaPayError("invalid_response", 502); });
}

export async function getWatchaPayAccess(userId: string, capability: WatchaPayCapability) {
  const config = watchaPayConfiguration(capability);
  if (!config) return { configured: false as const, channel: "alipay" as const };
  if (!userId || userId.length > 200) throw new WatchaPayError("invalid_user", 400);
  const result = parseWatchaPayAccess(await request(config, "access", { user_id: userId }));
  return { configured: true as const, environment: config.environment, channel: "alipay" as const, result };
}

/** Sandbox-only contract probe. NOT wired to AI billing: consume has no reversal API. */
export async function consumeWatchaPaySandboxQuota(userId: string, capability: WatchaPayCapability, operationId: string, amount = 1) {
  const config = watchaPayConfiguration(capability);
  if (!config || config.environment !== "sandbox") throw new WatchaPayError("sandbox_only");
  return consumeWatchaPayTransfer(userId, capability, operationId, amount);
}

/** Only call after persisting an immutable, user-authorized transfer in the database. */
export async function consumeWatchaPayTransfer(userId: string, capability: WatchaPayCapability, operationId: string, amount: number) {
  const config = watchaPayConfiguration(capability);
  if (!config) throw new WatchaPayError("configuration_action_required");
  if (!userId || userId.length > 200 || !operationId || operationId.length > 200 || !Number.isSafeInteger(amount) || amount < 1) {
    throw new WatchaPayError("invalid_consume_request", 400);
  }
  const idempotencyKey = createHash("sha256").update(JSON.stringify([config.environment, config.entitlementId, userId, operationId, amount])).digest("hex");
  const data = record(await request(config, "consume", { user_id: userId, amount, idempotency_key: idempotencyKey }));
  const entitlement = record(data.entitlement);
  if (data.consumed !== amount || entitlement.type !== "quota" || !Number.isSafeInteger(entitlement.remaining) || (entitlement.remaining as number) < 0) {
    throw new WatchaPayError("ambiguous_consume_response", 502);
  }
  return { consumed: amount, remaining: entitlement.remaining as number };
}
