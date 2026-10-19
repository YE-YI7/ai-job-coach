import { NextResponse } from "next/server";
import { getWatchaAuthorizeUrl, generateState } from "@/lib/watcha-oauth";
import { normalizeRedirectPath } from "@/lib/auth-redirect";
import { WatchaOAuthConfigurationError } from "@/lib/watcha-oauth-config";

export const runtime = "nodejs";

/**
 * GET /api/auth/watcha/authorize
 * 
 * 发起观猹 OAuth2 授权
 * 1. 生成随机 state
 * 2. 设置 state cookie（防 CSRF）
 * 3. 重定向到观猹授权页面
 */
export async function GET(request: Request) {
  // 请求 origin 继续交给凭据选择器做正式域名白名单验证。
  const requestUrl = new URL(request.url);
  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

  const redirectPath = normalizeRedirectPath(requestUrl.searchParams.get("redirect"));
  const state = generateState();
  let authorizeUrl: string;
  try {
    authorizeUrl = getWatchaAuthorizeUrl(state, baseUrl);
  } catch (error) {
    if (!(error instanceof WatchaOAuthConfigurationError)) throw error;
    if (error.reason === "unsupported_origin") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    }
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("error", error.message);
    if (redirectPath) loginUrl.searchParams.set("redirect", redirectPath);
    return NextResponse.redirect(loginUrl, { headers: { "Cache-Control": "private, no-store" } });
  }

  console.log("[WATCHA OAuth] 发起授权:", {
    baseUrl,
    configured: true,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.headers.set("Cache-Control", "private, no-store");

  // 设置 state cookie，5 分钟过期
  response.cookies.set("watcha_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 5,
    path: "/",
  });

  if (redirectPath) {
    response.cookies.set("watcha_oauth_redirect", redirectPath, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 5,
      path: "/",
    });
  } else {
    response.cookies.set("watcha_oauth_redirect", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
  }

  return response;
}
