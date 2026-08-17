import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";
import { createSessionToken, sessionCookie } from "@/lib/session";
import { consumePublicRateLimit, rateLimitedResponse } from "@/lib/public-rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/auth/create-session
 * 在邀请码验证后创建会话并设置 cookie
 * 
 * 请求体：{ "inviteCode": "ABC12345" }
 * 返回：{ "ok": true, "userId": "uuid" }
 */
export async function POST(request: Request) {
  try {
    let body = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "无效的 JSON 请求体" },
        { status: 400 }
      );
    }

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

    const client = await getDbClient();
    if (!client) {
      return NextResponse.json(
        { ok: false, error: "服务暂不可用" },
        { status: 503 }
      );
    }

    const trimmedCode = inviteCode.trim();
    const limit = await consumePublicRateLimit({ request, scope: "auth-invite-session", subject: trimmedCode, limit: 10, windowSeconds: 3600 });
    if (!limit.allowed) return rateLimitedResponse(limit);

    // 1. 查询邀请码
    const { data: invite, error: inviteError } = await client
      .from("invites")
      .select("*")
      .eq("code", trimmedCode)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json(
        { ok: false, error: "邀请码不存在" },
        { status: 400 }
      );
    }

    let userId: string;
    let isNewUser = false;

    // 2. 检查邀请码是否已被使用
    if (invite.used === true && invite.redeemed_by) {
      userId = invite.redeemed_by;
      await client.from("users").update({ last_active: new Date().toISOString() }).eq("id", userId);
    } else {
      // 3. 查找或创建用户
      const inviteEmail = `${trimmedCode}@invite.local`;
      const { data: existingUser } = await client
        .from("users")
        .select("id")
        .eq("email", inviteEmail)
        .single();

      if (existingUser) {
        userId = existingUser.id;
        await client.from("users").update({ last_active: new Date().toISOString() }).eq("id", userId);
      } else {
        isNewUser = true;
        userId = crypto.randomUUID();
        const now = new Date().toISOString();

        await client.from("users").insert({
          id: userId,
          email: inviteEmail,
          provider: "invite",
          invite_code: trimmedCode,
          created_at: now,
          last_active: now,
        });

        // 创建额度记录
        await client.from("user_quotas").insert({
          user_id: userId,
          free_chat_daily: 3,
          free_resume_daily: 1,
          paid_chat_remaining: 0,
          paid_resume_remaining: 0,
          paid_interview_remaining: 0,
          last_free_reset: now.split("T")[0],
        });

        // 更新邀请码状态
        const currentUsesCount = invite.uses_count || 0;
        const newUsesCount = currentUsesCount + 1;
        const maxUses = invite.max_uses || 1;
        const shouldMarkAsUsed = newUsesCount >= maxUses;

        const updateData: Record<string, unknown> = {
          uses_count: newUsesCount,
          redeemed_by: userId,
        };
        if (shouldMarkAsUsed) {
          updateData.used = true;
        }

        await client.from("invites").update(updateData).eq("code", trimmedCode);
      }
    }

    // 4. 创建 session cookie
    const fakeEmail = `${trimmedCode}@invite.local`;
    const sessionToken = await createSessionToken(userId, fakeEmail);

    const response = NextResponse.json({
      ok: true,
      userId,
      isNewUser,
    });

    response.cookies.set(sessionCookie.name, sessionToken, sessionCookie.options);
    response.cookies.set("sb-session-user-id", "", { ...sessionCookie.options, maxAge: 0 });

    return response;
  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
