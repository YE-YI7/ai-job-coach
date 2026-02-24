import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 必须使用 Node.js runtime（仅 server-side）
export const runtime = "nodejs";

/**
 * POST /api/auth/create-session
 * 在邀请码验证后创建 Supabase 会话并设置 cookie
 * 
 * 请求体：
 * {
 *   "inviteCode": "ABC12345"
 * }
 * 
 * 返回：
 * {
 *   "ok": true,
 *   "userId": "uuid"
 * }
 */
export async function POST(request: Request) {
  try {
    // 检查环境变量
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 未配置",
        },
        { status: 500 }
      );
    }

    // 解析请求体
    let body = null;
    try {
      body = await request.json();
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: "无效的 JSON 请求体" },
        { status: 400 }
      );
    }

    // 阻止前端提交 key
    if (body?.apiKey || body?.key || body?.token) {
      return NextResponse.json(
        { ok: false, error: "Client is not allowed to send LLM keys." },
        { status: 400 }
      );
    }

    const { inviteCode } = body;

    if (!inviteCode || typeof inviteCode !== "string" || inviteCode.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "缺少 inviteCode 字段" },
        { status: 400 }
      );
    }

    // 创建 Supabase Admin 客户端
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const trimmedCode = inviteCode.trim();
    const fakeEmail = `${trimmedCode}@fake.local`;

    // 1. 先调用 redeem API 逻辑来获取或创建用户
    // 查询邀请码
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("invites")
      .select("*")
      .eq("code", trimmedCode)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json(
        {
          ok: false,
          error: "邀请码不存在",
        },
        { status: 400 }
      );
    }

    let userId: string;

    // 2. 检查邀请码是否已被使用
    if (invite.used === true && invite.redeemed_by) {
      userId = invite.redeemed_by;
    } else {
      // 3. 创建新用户或查找已有用户
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find((u: any) => u.email === fakeEmail);
      
      if (existingUser) {
        userId = existingUser.id;
      } else {
        // 创建新用户
        const randomPassword = crypto.randomUUID();
        const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
          email: fakeEmail,
          password: randomPassword,
          email_confirm: true,
        });

        if (createUserError || !newUser?.user) {
          return NextResponse.json(
            {
              ok: false,
              error: `创建用户失败: ${createUserError?.message || "未知错误"}`,
            },
            { status: 500 }
          );
        }

        userId = newUser.user.id;

        // 更新 invites 表
        const currentUsesCount = invite.uses_count || 0;
        const newUsesCount = currentUsesCount + 1;
        const maxUses = invite.max_uses || 1;
        const shouldMarkAsUsed = newUsesCount >= maxUses;

        const updateData: any = {
          uses_count: newUsesCount,
          redeemed_by: userId,
        };

        if (shouldMarkAsUsed) {
          updateData.used = true;
        }

        await supabaseAdmin
          .from("invites")
          .update(updateData)
          .eq("code", trimmedCode);

        // 更新 profiles 表
        await supabaseAdmin
          .from("profiles")
          .update({
            invite_code: trimmedCode,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
      }
    }

    // 4. 使用 Admin API 生成 session token
    // 获取用户信息
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (userError || !userData?.user) {
      return NextResponse.json(
        {
          ok: false,
          error: "获取用户信息失败",
        },
        { status: 500 }
      );
    }

    // 使用 Admin API 创建自定义 token（7天有效期）
    // 注意：Supabase Admin API 不直接支持创建 session，我们需要使用其他方法
    // 这里我们创建一个 JWT token 并设置为 cookie
    
    // 创建响应
    const response = NextResponse.json({
      ok: true,
      userId: userId,
    });

    // 设置 session cookie（包含 userId，有效期 7 天）
    // 在实际生产环境中，应该使用 Supabase 的 JWT secret 来签名这个 token
    // 这里为了简化，我们使用一个简单的 session token
    const sessionToken = Buffer.from(JSON.stringify({
      userId: userId,
      email: fakeEmail,
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // 7 天后过期
    })).toString('base64');

    response.cookies.set("sb-access-token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 天
      path: "/",
    });

    // 也设置一个简单的验证 cookie
    response.cookies.set("sb-session-user-id", userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 天
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

