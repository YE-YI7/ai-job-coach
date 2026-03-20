import { NextResponse } from "next/server";
import { getWatchaAuthorizeUrl, generateState } from "@/lib/watcha-oauth";

export const runtime = "nodejs";

/**
 * GET /api/auth/watcha/authorize
 * 
 * 发起观猹 OAuth2 授权
 * 1. 生成随机 state
 * 2. 设置 state cookie（防 CSRF）
 * 3. 重定向到观猹授权页面
 */
export async function GET() {
  const state = generateState();
  const authorizeUrl = getWatchaAuthorizeUrl(state);

  console.log("[WATCHA OAuth] 发起授权:", {
    authorizeUrl,
    clientId: process.env.WATCHA_CLIENT_ID,
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
  });

  const response = NextResponse.redirect(authorizeUrl);

  // 设置 state cookie，5 分钟过期
  response.cookies.set("watcha_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 5,
    path: "/",
  });

  return response;
}
