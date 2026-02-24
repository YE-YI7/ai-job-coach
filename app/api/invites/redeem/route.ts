import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 必须使用 Node.js runtime（仅 server-side）
export const runtime = "nodejs";

/**
 * POST /api/invites/redeem
 * 兑换邀请码并创建用户
 * 
 * 请求体：
 * {
 *   "code": "AIJC-AAAAAA"
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
    let requestBody: any = {};
    try {
      requestBody = await request.json();
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "请求体格式错误，需要有效的 JSON",
        },
        { status: 400 }
      );
    }

    // 阻止前端提交 key
    if (requestBody.apiKey || requestBody.key || requestBody.token) {
      return NextResponse.json(
        { error: "Client is not allowed to send LLM keys." },
        { status: 400 }
      );
    }

    const body = requestBody;
    const { code } = body;

    // 验证必需参数
    if (!code || typeof code !== "string" || code.trim().length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "缺少 code 字段",
        },
        { status: 400 }
      );
    }

    // 创建 Supabase Admin 客户端（使用 Service Role Key，具有完整权限）
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const trimmedCode = code.trim();

    // 1. 查询邀请码并检查有效性
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

    // 2. 检查是否已被使用 - 如果已使用，直接返回已绑定的 user_id
    if (invite.used === true && invite.redeemed_by) {
      // 邀请码已被使用，直接返回已绑定的用户 ID
      return NextResponse.json({
        ok: true,
        userId: invite.redeemed_by,
      });
    }
    
    // 如果已使用但没有绑定用户，继续创建新用户流程（可能是之前创建失败的情况）
    if (invite.used === true && !invite.redeemed_by) {
      // 允许继续创建新用户
    }

    // 检查使用次数是否已用完
    if (invite.max_uses && invite.uses_count !== undefined) {
      if (invite.uses_count >= invite.max_uses) {
        return NextResponse.json(
          {
            ok: false,
            error: "邀请码使用次数已用完",
          },
          { status: 400 }
        );
      }
    }

    // 检查是否过期
    if (invite.expires_at) {
      const expiresAt = new Date(invite.expires_at);
      const now = new Date();
      if (now > expiresAt) {
        return NextResponse.json(
          {
            ok: false,
            error: "邀请码已过期",
          },
          { status: 400 }
        );
      }
    }

    // 3. 创建用户（使用 Supabase Admin API）
    // 使用假邮箱和随机密码创建用户
    const fakeEmail = `${trimmedCode}@fake.local`;
    const randomPassword = crypto.randomUUID();
    
    let userId: string;
    try {
      const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email: fakeEmail,
        password: randomPassword,
        email_confirm: true, // 自动确认邮箱
      });

      if (createUserError || !newUser?.user) {
        // 如果邮箱已存在，尝试查找已有用户
        if (String(createUserError).includes("already been registered") || String(createUserError).includes("already exists") || String(createUserError).includes("duplicate")) {
          // 查找已有用户
          const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = existingUsers?.users?.find((u: any) => u.email === fakeEmail);
          if (existingUser) {
            userId = existingUser.id;
            // 直接返回已有用户
            return NextResponse.json({
              ok: true,
              userId: userId,
              existed: true,
            });
          }
        }
        console.error("创建用户失败:", createUserError);
        return NextResponse.json(
          {
            ok: false,
            error: `创建用户失败: ${createUserError?.message || "未知错误"}`,
          },
          { status: 500 }
        );
      }

      userId = newUser.user.id;
    } catch (err: any) {
      // 如果邮箱已存在，尝试查找已有用户
      if (String(err).includes("already been registered") || String(err).includes("already exists") || String(err).includes("duplicate")) {
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find((u: any) => u.email === fakeEmail);
        if (existingUser) {
          return NextResponse.json({
            ok: true,
            userId: existingUser.id,
            existed: true,
          });
        }
      }
      throw err;
    }

    // 4. 计算更新后的使用次数
    const currentUsesCount = invite.uses_count || 0;
    const newUsesCount = currentUsesCount + 1;
    const maxUses = invite.max_uses || 1;
    
    // 判断是否需要标记为已使用
    const shouldMarkAsUsed = newUsesCount >= maxUses;

    // 5. 原子性更新 invites 表
    const updateData: any = {
      uses_count: newUsesCount,
      redeemed_by: userId,
    };

    // 如果使用次数达到上限，标记为已使用
    if (shouldMarkAsUsed) {
      updateData.used = true;
    }

    // 使用条件更新确保原子性
    // 如果邀请码未使用，添加条件确保只更新未使用的邀请码
    // 如果邀请码已使用但没有绑定用户，允许更新
    let updateQuery = supabaseAdmin
      .from("invites")
      .update(updateData)
      .eq("code", trimmedCode);

    // 只有当邀请码未使用时，才添加 used = false 条件
    if (invite.used === false) {
      updateQuery = updateQuery.eq("used", false);
    }
    // 如果已使用但没有绑定用户，不添加 used 条件，允许更新

    const { data: updatedInvite, error: updateError } = await updateQuery
      .select()
      .single();

    if (updateError || !updatedInvite) {
      console.error("更新邀请码失败:", updateError);
      console.error("当前邀请码状态:", invite);
      
      // 如果更新失败，尝试删除刚创建的用户（回滚）
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (deleteError) {
        console.error("回滚删除用户失败:", deleteError);
      }

      // 检查是否是并发问题（邀请码已被其他请求使用）
      if (!updatedInvite) {
        return NextResponse.json(
          {
            ok: false,
            error: "邀请码已被其他用户使用，请重试",
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          error: `更新邀请码失败: ${updateError?.message || "未知错误"}`,
        },
        { status: 500 }
      );
    }

    // 6. 更新 profiles 表（使用 invite_code 字段）
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        invite_code: trimmedCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (profileError) {
      console.error("更新 profiles 失败:", profileError);
      // 如果更新失败，尝试删除刚创建的用户（回滚）
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        // 回滚 invites 更新
        await supabaseAdmin
          .from("invites")
          .update({
            used: false,
            redeemed_by: null,
            uses_count: invite.uses_count || 0,
          })
          .eq("code", trimmedCode);
      } catch (rollbackError) {
        console.error("回滚失败:", rollbackError);
      }

      return NextResponse.json(
        {
          ok: false,
          error: `更新用户资料失败: ${profileError.message}`,
        },
        { status: 500 }
      );
    }

    // 7. 返回成功响应
    return NextResponse.json({
      ok: true,
      userId: userId,
    });
  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

