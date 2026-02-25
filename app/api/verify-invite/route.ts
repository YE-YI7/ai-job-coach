import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/verify-invite
 * 验证邀请码（简化版：只检查存在性和过期时间）
 */
export async function POST(request: Request) {
  try {
    let body = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, status: "invalid", message: "无效的 JSON 请求体" },
        { status: 400 }
      );
    }

    if (body?.apiKey || body?.key || body?.token) {
      return NextResponse.json(
        { success: false, status: "invalid", message: "Client is not allowed to send LLM keys." },
        { status: 400 }
      );
    }

    if (!body?.code || typeof body.code !== "string" || body.code.trim().length === 0) {
      return NextResponse.json(
        { success: false, status: "invalid", message: "缺少 code 参数" },
        { status: 400 }
      );
    }

    const code = body.code.trim();

    const client = await getDbClient();
    if (!client) {
      return NextResponse.json(
        { success: false, status: "invalid", message: "服务暂不可用" },
        { status: 503 }
      );
    }

    const { data: invite, error } = await client
      .from("invites")
      .select("*")
      .eq("code", code)
      .single();

    if (error || !invite) {
      return NextResponse.json({
        success: false,
        status: "invalid",
        message: "邀请码不存在",
      });
    }

    if (invite.expires_at && new Date() > new Date(invite.expires_at)) {
      return NextResponse.json({
        success: false,
        status: "expired",
        message: "邀请码已过期",
      });
    }

    return NextResponse.json({
      success: true,
      status: "valid",
      message: "邀请码有效",
      invite,
    });
  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json(
      { success: false, status: "invalid", message: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
