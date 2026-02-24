import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 明确指定使用 Node.js runtime（Supabase 需要 Node.js API）
export const runtime = "nodejs";

/**
 * Next.js Middleware - 认证拦截
 * 
 * 功能：
 * 1. 允许匿名访问：/login, /invite, /api/*, 静态文件
 * 2. 拦截所有其他路径，检查 Supabase session
 * 3. 未登录用户 → 302 重定向到 /login
 * 4. 会话有效期：7 天
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ========== 允许匿名访问的路径 ==========
  
  // 登录页面
  if (pathname === "/login" || pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  // 邀请码相关页面
  if (pathname === "/invite" || pathname.startsWith("/invite")) {
    return NextResponse.next();
  }

  // 简历评分落地页（无需登录）
  if (pathname === "/resume-score" || pathname.startsWith("/resume-score")) {
    return NextResponse.next();
  }

  // 兑换码页面
  if (pathname === "/redeem" || pathname.startsWith("/redeem")) {
    return NextResponse.next();
  }

  // API 路由（保持现有后端 API 正常访问）
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // 静态文件
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

  // 检查环境变量
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Middleware: SUPABASE_URL 或 SUPABASE_ANON_KEY 未配置");
    // 如果环境变量未配置，允许访问（开发环境容错）
    return NextResponse.next();
  }

  // 创建 Supabase 客户端（使用 Anon Key 用于基本验证）
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // 如果有 Service Role Key，创建 Admin 客户端用于用户验证
  let supabaseAdmin = null;
  if (supabaseServiceKey) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  // 从 cookie 中获取 session 信息
  const sessionToken = request.cookies.get("sb-access-token")?.value;
  const userId = request.cookies.get("sb-session-user-id")?.value;

  // 也尝试从 Authorization header 获取
  const authHeader = request.headers.get("authorization");
  
  let isValidSession = false;

  // 方法 1: 检查 session cookie
  if (sessionToken && userId) {
    try {
      // 解析 session token
      const sessionData = JSON.parse(Buffer.from(sessionToken, 'base64').toString());
      
      // 检查是否过期
      if (sessionData.exp && sessionData.exp > Math.floor(Date.now() / 1000)) {
        // 验证用户是否存在于 Supabase（如果有 Admin 客户端）
        if (supabaseAdmin) {
          const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
          
          if (!userError && userData?.user && userData.user.id === userId) {
            isValidSession = true;
          }
        } else {
          // 如果没有 Admin 客户端，只做基本的格式验证
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (uuidRegex.test(userId) && sessionData.userId === userId) {
            isValidSession = true;
          }
        }
      }
    } catch (err) {
      console.error("Middleware: 解析 session token 失败", err);
    }
  }

  // 方法 2: 如果 cookie 验证失败，尝试从 Authorization header 验证
  if (!isValidSession && authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        isValidSession = true;
      }
    } catch (err) {
      console.error("Middleware: 验证 header token 失败", err);
    }
  }

  // 方法 3: 直接验证 userId cookie（如果前面验证都失败）
  if (!isValidSession && userId && supabaseAdmin) {
    try {
      // 使用 Admin API 验证用户是否存在
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
      
      if (!userError && userData?.user) {
        isValidSession = true;
      }
    } catch (err) {
      console.error("Middleware: 验证 userId 失败", err);
    }
  }

  // 如果 session 无效，重定向到登录页
  if (!isValidSession) {
    const loginUrl = new URL("/login", request.url);
    // 保存原始请求路径，登录后可以重定向回来
    if (pathname !== "/login") {
      loginUrl.searchParams.set("redirect", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 有有效的 session，允许访问
  return NextResponse.next();
}

// 配置 middleware 匹配规则
export const config = {
  matcher: [
    /*
     * 匹配所有路径，除了：
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!api|_next/static|_next/image|favicon.ico|public).*)",
  ],
};

