import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";
import { exchangeCodeForToken, getWatchaUserInfo } from "@/lib/watcha-oauth";

export const runtime = "nodejs";

function normalizeRedirectPath(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/login")) {
    return null;
  }

  return path;
}

function buildLoginRedirectUrl(baseUrl: string, errorMessage: string, redirectPath?: string | null) {
  const loginUrl = new URL("/login", baseUrl);

  if (redirectPath) {
    loginUrl.searchParams.set("redirect", redirectPath);
  }

  loginUrl.searchParams.set("error", errorMessage);
  return loginUrl.toString();
}

/**
 * 生成中间跳转 HTML 页面
 * 
 * 为什么不能直接 302 redirect + Set-Cookie？
 * 因为 OAuth 回调是从 watcha.cn 跳过来的跨站请求，
 * 浏览器可能不保存 302 响应中的 Set-Cookie（SameSite 限制）。
 * 所以先返回一个在我们域名下的 HTML 页面，
 * 用 JS 设置 cookie 后再 location.href 跳转。
 */
function buildRedirectHtml(
  sessionToken: string,
  userId: string,
  redirectPath: string
): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>登录中...</title></head>
<body>
<p style="text-align:center;margin-top:40vh;color:#888;font-family:sans-serif;">正在登录，请稍候...</p>
<script>
  var maxAge = ${60 * 60 * 24 * 7};
  var secure = location.protocol === 'https:' ? ';Secure' : '';
  document.cookie = 'sb-access-token=${sessionToken};path=/;max-age=' + maxAge + ';SameSite=Lax' + secure;
  document.cookie = 'sb-session-user-id=${userId};path=/;max-age=' + maxAge + ';SameSite=Lax' + secure;
  document.cookie = 'watcha_oauth_state=;path=/;max-age=0';
  document.cookie = 'watcha_oauth_redirect=;path=/;max-age=0';
  location.href = '${redirectPath}';
</script>
</body>
</html>`;
}

/**
 * GET /api/auth/watcha/callback
 * 
 * 观猹 OAuth2 回调端点
 * 处理流程：
 * 1. 接收 code 和 state
 * 2. 用 code 换取 access_token
 * 3. 用 access_token 获取用户信息
 * 4. 在 users 表中查找或创建用户（provider = 'watcha'）
 * 5. 返回中间 HTML 页面设置 cookie 并跳转
 */
export async function GET(request: Request) {
  // 从请求 URL 提取 origin（与 authorize 路由一致，不依赖环境变量）
  const requestUrl = new URL(request.url);
  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

  try {
    const url = requestUrl;
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");
    const cookieHeader = request.headers.get("cookie") || "";
    const requestedRedirect = normalizeRedirectPath(
      cookieHeader
        .split(";")
        .find((c) => c.trim().startsWith("watcha_oauth_redirect="))
        ?.split("=")[1]
        ?.trim() || null
    );

    console.log("[WATCHA OAuth] 收到回调:", { 
      hasCode: !!code, 
      hasState: !!state, 
      error, 
      errorDescription,
      fullUrl: request.url 
    });

    // 用户拒绝授权或出错
    if (error) {
      console.warn(`[WATCHA OAuth] 授权失败: ${error} - ${errorDescription}`);
      return NextResponse.redirect(
        buildLoginRedirectUrl(baseUrl, errorDescription || "授权失败", requestedRedirect)
      );
    }

    if (!code) {
      console.warn("[WATCHA OAuth] 回调缺少 code 参数");
      return NextResponse.redirect(
        buildLoginRedirectUrl(baseUrl, "缺少授权码", requestedRedirect)
      );
    }

    // 验证 state（从 cookie 中取）
    const cookieState = cookieHeader
      .split(";")
      .find((c) => c.trim().startsWith("watcha_oauth_state="))
      ?.split("=")[1]
      ?.trim();

    console.log("[WATCHA OAuth] state 验证:", { 
      urlState: state, 
      cookieState: cookieState ? `${cookieState.slice(0, 8)}...` : "无",
      allCookies: cookieHeader.split(";").map(c => c.trim().split("=")[0])
    });

    if (state && cookieState && state !== cookieState) {
      console.warn("[WATCHA OAuth] state 不匹配，可能存在 CSRF 攻击");
      return NextResponse.redirect(
        buildLoginRedirectUrl(baseUrl, "安全验证失败，请重试", requestedRedirect)
      );
    }

    // Step 1: 用授权码换取 token
    console.log("[WATCHA OAuth] 开始换取 token...");
    const tokenData = await exchangeCodeForToken(code, baseUrl);
    console.log("[WATCHA OAuth] Token 换取成功, expires_in:", tokenData.expires_in);

    // Step 2: 获取用户信息
    console.log("[WATCHA OAuth] 获取用户信息...");
    const watchaUser = await getWatchaUserInfo(tokenData.access_token);
    console.log("[WATCHA OAuth] 用户信息:", { 
      user_id: watchaUser.user_id, 
      nickname: watchaUser.nickname 
    });

    // Step 3: 在数据库中查找或创建用户
    const client = await getDbClient();
    if (!client) {
      console.error("[WATCHA OAuth] 无法获取数据库客户端");
      return NextResponse.redirect(
        buildLoginRedirectUrl(baseUrl, "服务暂不可用", requestedRedirect)
      );
    }

    const watchaEmail = `watcha_${watchaUser.user_id}@watcha.cn`;
    let userId: string;
    let isNewUser = false;

    // 先用 watcha 唯一标识查找
    const { data: existingUser, error: findError } = await client
      .from("users")
      .select("id")
      .eq("email", watchaEmail)
      .single();

    console.log("[WATCHA OAuth] 查找用户:", { 
      email: watchaEmail, 
      found: !!existingUser,
      findError: findError?.message 
    });

    if (existingUser) {
      userId = existingUser.id;
      // 更新用户信息
      await client
        .from("users")
        .update({
          last_active: new Date().toISOString(),
          nickname: watchaUser.nickname || undefined,
          avatar_url: watchaUser.avatar_url || undefined,
        })
        .eq("id", userId);
    } else {
      // 创建新用户
      isNewUser = true;
      userId = crypto.randomUUID();
      const now = new Date().toISOString();

      const { error: insertError } = await client.from("users").insert({
        id: userId,
        email: watchaEmail,
        provider: "watcha",
        nickname: watchaUser.nickname || null,
        avatar_url: watchaUser.avatar_url || null,
        created_at: now,
        last_active: now,
      });

      if (insertError) {
        console.warn("[WATCHA OAuth] 插入用户失败，尝试再次查找:", insertError.message);
        // 并发冲突，再查一次
        const { data: retryUser } = await client
          .from("users")
          .select("id")
          .eq("email", watchaEmail)
          .single();

        if (retryUser) {
          userId = retryUser.id;
          isNewUser = false;
        } else {
          console.error("[WATCHA OAuth] 创建用户失败:", insertError);
          return NextResponse.redirect(
            buildLoginRedirectUrl(baseUrl, "创建账号失败，请重试", requestedRedirect)
          );
        }
      }

      // 为新用户创建额度记录
      if (isNewUser) {
        const today = now.split("T")[0];
        await client.from("user_quotas").insert({
          user_id: userId,
          free_chat_daily: 3,
          free_resume_daily: 1,
          paid_chat_remaining: 0,
          paid_resume_remaining: 0,
          paid_interview_remaining: 0,
          last_free_reset: today,
        });
        console.log("[WATCHA OAuth] 新用户额度记录已创建");
      }
    }

    // Step 4: 保存观猹 token 到数据库（用于后续刷新）
    const { error: upsertError } = await client.from("watcha_tokens").upsert(
      {
        user_id: userId,
        watcha_user_id: watchaUser.user_id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (upsertError) {
      console.warn("[WATCHA OAuth] 保存 token 失败（不影响登录）:", upsertError);
    }

    // Step 5: 生成 session token，返回中间页面设置 cookie
    const sessionToken = Buffer.from(
      JSON.stringify({
        userId,
        email: watchaEmail,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 天
      })
    ).toString("base64");

    const redirectPath = requestedRedirect
      ? (isNewUser && !requestedRedirect.startsWith("/resume-score")
          ? `/onboarding?redirect=${encodeURIComponent(requestedRedirect)}`
          : requestedRedirect)
      : (isNewUser ? "/onboarding" : "/chat");

    console.log(
      `[WATCHA OAuth] 登录成功: watchaUserId=${watchaUser.user_id}, userId=${userId}, isNew=${isNewUser}, redirect=${redirectPath}`
    );

    // 返回中间 HTML 页面，由前端 JS 设置 cookie 后跳转
    const html = buildRedirectHtml(sessionToken, userId, redirectPath);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // 同时在 response header 中也设置 cookie（双保险）
        "Set-Cookie": [
          `sb-access-token=${sessionToken}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`,
          `sb-session-user-id=${userId}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`,
          `watcha_oauth_state=; Path=/; Max-Age=0`,
          `watcha_oauth_redirect=; Path=/; Max-Age=0`,
        ].join(", "),
      },
    });
  } catch (err) {
    console.error("[WATCHA OAuth] 回调处理失败:", err);
    const cookieHeader = request.headers.get("cookie") || "";
    const requestedRedirect = normalizeRedirectPath(
      cookieHeader
        .split(";")
        .find((c) => c.trim().startsWith("watcha_oauth_redirect="))
        ?.split("=")[1]
        ?.trim() || null
    );

    return NextResponse.redirect(
      buildLoginRedirectUrl(baseUrl, "登录失败，请重试", requestedRedirect)
    );
  }
}
