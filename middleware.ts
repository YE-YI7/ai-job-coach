import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/session";

/**
 * Next.js Middleware - 认证拦截
 * 
 * 功能：
 * 1. 允许匿名访问：/login, /invite, /api/*, 静态文件
 * 2. 拦截所有其他路径，检查 session cookie
 * 3. 未登录用户 → 302 重定向到 /login
 * 4. 会话有效期：7 天
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ========== 允许匿名访问的路径 ==========
  
  if (pathname === "/login" || pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  if (pathname === "/invite" || pathname.startsWith("/invite")) {
    return NextResponse.next();
  }

  if (pathname === "/resume-score" || pathname.startsWith("/resume-score")) {
    return NextResponse.next();
  }

  if (process.env.NODE_ENV === "development" && pathname === "/cockpit/preview") {
    return NextResponse.next();
  }

  if (pathname === "/redeem" || pathname.startsWith("/redeem")) {
    return NextResponse.next();
  }

  if (pathname === "/llms.txt" || pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/public/") ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)$/)
  ) {
    return NextResponse.next();
  }

  // ========== 需要认证的路径 ==========

  const sessionToken = request.cookies.get("sb-access-token")?.value;
  const isValidSession = Boolean(await verifySessionToken(sessionToken));

  // 如果 session 无效，重定向到登录页
  if (!isValidSession) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/login") {
      loginUrl.searchParams.set("redirect", `${pathname}${request.nextUrl.search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// 配置 middleware 匹配规则
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|public).*)",
  ],
};
