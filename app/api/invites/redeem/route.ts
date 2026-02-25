import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/invites/redeem
 * 兑换邀请码并创建用户
 * 
 * 请求体：{ "code": "AIJC-AAAAAA" }
 * 返回：{ "ok": true, "userId": "uuid" }
 */
export async function POST(request: Request) {
  try {
    let requestBody: any = {};
    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "请求体格式错误，需要有效的 JSON" },
        { status: 400 }
      );
    }

    if (requestBody.apiKey || requestBody.key || requestBody.token) {
      return NextResponse.json(
        { error: "Client is not allowed to send LLM keys." },
        { status: 400 }
      );
    }

    const { code } = requestBody;

    if (!code || typeof code !== "string" || code.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "缺少 code 字段" },
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

    const trimmedCode = code.trim();

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

    // 2. 如果已使用且有绑定用户，直接返回
    if (invite.used === true && invite.redeemed_by) {
      return NextResponse.json({
        ok: true,
        userId: invite.redeemed_by,
      });
    }

    // 3. 检查使用次数
    if (invite.max_uses && invite.uses_count !== undefined) {
      if (invite.uses_count >= invite.max_uses) {
        return NextResponse.json(
          { ok: false, error: "邀请码使用次数已用完" },
          { status: 400 }
        );
      }
    }

    // 4. 检查是否过期
    if (invite.expires_at) {
      if (new Date() > new Date(invite.expires_at)) {
        return NextResponse.json(
          { ok: false, error: "邀请码已过期" },
          { status: 400 }
        );
      }
    }

    // 5. 查找或创建用户
    const inviteEmail = `${trimmedCode}@invite.local`;
    const { data: existingUser } = await client
      .from("users")
      .select("id")
      .eq("email", inviteEmail)
      .single();

    if (existingUser) {
      return NextResponse.json({
        ok: true,
        userId: existingUser.id,
        existed: true,
      });
    }

    // 创建新用户
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error: createError } = await client.from("users").insert({
      id: userId,
      email: inviteEmail,
      provider: "invite",
      invite_code: trimmedCode,
      created_at: now,
      last_active: now,
    });

    if (createError) {
      console.error("创建用户失败:", createError);
      return NextResponse.json(
        { ok: false, error: `创建用户失败: ${createError.message}` },
        { status: 500 }
      );
    }

    // 6. 创建额度记录
    await client.from("user_quotas").insert({
      user_id: userId,
      free_chat_daily: 3,
      free_resume_daily: 1,
      paid_chat_remaining: 0,
      paid_resume_remaining: 0,
      paid_interview_remaining: 0,
      last_free_reset: now.split("T")[0],
    });

    // 7. 更新邀请码状态
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

    await client
      .from("invites")
      .update(updateData)
      .eq("code", trimmedCode);

    return NextResponse.json({
      ok: true,
      userId,
    });
  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
