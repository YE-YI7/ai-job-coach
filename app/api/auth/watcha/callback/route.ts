import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";
import { exchangeCodeForToken, getWatchaUserInfo } from "@/lib/watcha-oauth";

export const runtime = "nodejs";

/**
 * GET /api/auth/watcha/callback
 * 
 * 观猹 OAuth2 回调端点
 * 处理流程：
 * 1. 接收 code 和 state
 * 2. 用 code 换取 access_token
 * 3. 用 access_token 获取用户信息
 * 4. 在 users 表中查找或创建用户（provider = 'watcha'）
 * 5. 设置 session cookie
 * 6. 重定向到前端
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    // 用户拒绝授权或出错
    if (error) {
      console.warn(`[WATCHA OAuth] 授权失败: ${error} - ${errorDescription}`);
      return NextResponse.redirect(
        `${baseUrl}/login?error=${encodeURIComponent(errorDescription || "授权失败")}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${baseUrl}/login?error=${encodeURIComponent("缺少授权码")}`
      );
    }

    // 验证 state（从 cookie 中取）
    const cookieState = request.headers.get("cookie")
      ?.split(";")
      .find((c) => c.trim().startsWith("watcha_oauth_state="))
      ?.split("=")[1]
      ?.trim();

    if (state && cookieState && state !== cookieState) {
      console.warn("[WATCHA OAuth] state 不匹配，可能存在 CSRF 攻击");
      return NextResponse.redirect(
        `${baseUrl}/login?error=${encodeURIComponent("安全验证失败，请重试")}`
      );
    }

    // Step 1: 用授权码换取 token
    const tokenData = await exchangeCodeForToken(code);

    // Step 2: 获取用户信息
    const watchaUser = await getWatchaUserInfo(tokenData.access_token);

    // Step 3: 在数据库中查找或创建用户
    const client = await getDbClient();
    if (!client) {
      return NextResponse.redirect(
        `${baseUrl}/login?error=${encodeURIComponent("服务暂不可用")}`
      );
    }

    const watchaEmail = `watcha_${watchaUser.user_id}@watcha.cn`;
    let userId: string;
    let isNewUser = false;

    // 先用 watcha 唯一标识查找
    const { data: existingUser } = await client
      .from("users")
      .select("id")
      .eq("email", watchaEmail)
      .single();

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
            `${baseUrl}/login?error=${encodeURIComponent("创建账号失败，请重试")}`
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
      }
    }

    // Step 4: 保存观猹 token 到数据库（用于后续刷新）
    await client.from("watcha_tokens").upsert(
      {
        user_id: userId,
        watcha_user_id: watchaUser.user_id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    ).then(({ error: upsertError }: { error: unknown }) => {
      if (upsertError) {
        console.warn("[WATCHA OAuth] 保存 token 失败（不影响登录）:", upsertError);
      }
    });

    // Step 5: 设置 session cookie 并重定向
    const sessionToken = Buffer.from(
      JSON.stringify({
        userId,
        email: watchaEmail,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 天
      })
    ).toString("base64");

    const redirectPath = isNewUser ? "/onboarding" : "/chat";
    const response = NextResponse.redirect(`${baseUrl}${redirectPath}`);

    response.cookies.set("sb-access-token", sessionToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    response.cookies.set("sb-session-user-id", userId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    // 清除 state cookie
    response.cookies.set("watcha_oauth_state", "", {
      maxAge: 0,
      path: "/",
    });

    console.log(
      `[WATCHA OAuth] 登录成功: watchaUserId=${watchaUser.user_id}, userId=${userId}, isNew=${isNewUser}`
    );

    return response;
  } catch (err) {
    console.error("[WATCHA OAuth] 回调处理失败:", err);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    return NextResponse.redirect(
      `${baseUrl}/login?error=${encodeURIComponent("登录失败，请重试")}`
    );
  }
}
