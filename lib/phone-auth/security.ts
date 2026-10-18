import "server-only";
import { createHmac } from "node:crypto";
import { getClientAddress } from "@/lib/public-rate-limit";

export const phoneCookie = {
  name: process.env.NODE_ENV === "production" ? "__Host-yizhi-phone" : "yizhi-phone",
  options: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: 600 },
};

export function phoneHash(scope: string, value: string) {
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) throw new Error("PHONE_AUTH_SECRET_UNAVAILABLE");
  return createHmac("sha256", secret).update(`phone-auth-v1\n${scope}\n${value}`).digest("hex");
}

export function isSameOriginRequest(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return false;
  try {
    // Next may reconstruct request.url with an internal proxy host. Host is a
    // forbidden browser request header, unlike a caller-supplied body/redirect.
    const target = new URL(request.url);
    const host = request.headers.get("host") || target.host;
    if (/[\s/\\@?#]/.test(host)) return false;
    const protocol = process.env.NODE_ENV === "production" ? "https:" : target.protocol;
    return request.headers.get("origin") === `${protocol}//${host}`
      && request.headers.get("sec-fetch-site") !== "cross-site";
  } catch { return false; }
}

export function phoneIpHash(request: Request) {
  return phoneHash("ip", getClientAddress(request));
}
