import { createHash } from "node:crypto";
import { getDbClient } from "./db";

export type PublicRateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function getClientAddress(request: Request) {
  const candidate = request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]
    || "unknown";
  return candidate.trim().replace(/[^a-fA-F0-9.:]/g, "").slice(0, 64) || "unknown";
}

export function hashRateLimitIdentity(scope: string, address: string, subject: string, secret: string) {
  return createHash("sha256")
    .update(`${secret}\n${scope}\n${address}\n${subject.trim().toLowerCase()}`)
    .digest("hex");
}

export async function consumePublicRateLimit(input: {
  request: Request;
  scope: string;
  subject?: string;
  limit: number;
  windowSeconds: number;
}): Promise<PublicRateLimitResult> {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("RATE_LIMIT_SECRET is not configured");
  const db = await getDbClient();
  if (!db) return { allowed: true, remaining: input.limit, retryAfterSeconds: 0 };
  const keyHash = hashRateLimitIdentity(input.scope, getClientAddress(input.request), input.subject || "", secret);
  const { data, error } = await db.rpc("consume_public_action_rate_limit", {
    p_scope: input.scope,
    p_key_hash: keyHash,
    p_window_seconds: input.windowSeconds,
    p_limit: input.limit,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(row?.allowed),
    remaining: Math.max(0, Number(row?.remaining || 0)),
    retryAfterSeconds: Math.max(1, Number(row?.retry_after_seconds || input.windowSeconds)),
  };
}

export function rateLimitedResponse(result: PublicRateLimitResult, message = "请求过于频繁，请稍后重试") {
  return Response.json({ ok: false, error: message }, {
    status: 429,
    headers: { "Retry-After": String(result.retryAfterSeconds) },
  });
}
