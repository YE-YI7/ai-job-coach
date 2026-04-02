import { NextResponse } from "next/server";
import { getWatchaAuthorizeUrl, generateState } from "@/lib/watcha-oauth";

export const runtime = "nodejs";

function normalizeRedirectPath(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/login")) {
    return null;
  }

  return path;
}

/**
 * GET /api/auth/watcha/authorize
 * 
 * 发起观猹 OAuth2 授权
 * 1. 生成随机 state
 * 2. 设置 state cookie（防 CSRF）
 * 3. 重定向到观猹授权页面
 */
export async function GET(request: Request) {
  // 从请求 URL 中提取 origin（如 https://ai-job-coach.xin）
  // 这样不依赖环境变量，100% 准确
  const requestUrl = new URL(request.url);
  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

  const state = generateState();
  const redirectPath = normalizeRedirectPath(requestUrl.searchParams.get("redirect"));
  const authorizeUrl = getWatchaAuthorizeUrl(state, baseUrl);

  console.log("[WATCHA OAuth] 发起授权:", {
    authorizeUrl,
    baseUrl,
    clientId: process.env.WATCHA_CLIENT_ID,
    envBaseUrl: process.env.NEXT_PUBLIC_BASE_URL,
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
