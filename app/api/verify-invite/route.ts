import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 必须使用 Node.js runtime（仅 server-side）
export const runtime = "nodejs";

/**
 * POST /api/verify-invite
 * 验证邀请码（简化版：只检查存在性和过期时间，不限制使用次数）
 * 
 * 请求体：
 * {
 *   "code": "ABC12345"
 * }
 * 
 * 返回（成功）：
 * {
 *   "success": true,
 *   "status": "valid",
 *   "message": "邀请码有效",
 *   "invite": { ... }
 * }
 * 
 * 返回（失败）：
 * {
 *   "success": false,
 *   "status": "invalid" | "expired",
 *   "message": "错误信息"
 * }
 */
export async function POST(request: Request) {
  try {
    // 检查环境变量
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          success: false,
          status: "invalid",
          message: "SUPABASE_URL 或 SUPABASE_ANON_KEY 未配置",
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
        {
          success: false,
          status: "invalid",
          message: "无效的 JSON 请求体",
        },
        { status: 400 }
      );
    }

    // 阻止前端提交 key
    if (body?.apiKey || body?.key || body?.token) {
      return NextResponse.json(
        {
          success: false,
          status: "invalid",
          message: "Client is not allowed to send LLM keys.",
        },
        { status: 400 }
      );
    }

    // 验证必需参数
    if (!body?.code || typeof body.code !== "string" || body.code.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          status: "invalid",
          message: "缺少 code 参数",
        },
        { status: 400 }
      );
    }

    const code = body.code.trim();

    // 创建 Supabase 客户端（使用 Anon Key，允许 anonymous 访问）
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 查询邀请码
    const { data: invite, error } = await supabase
      .from("invites")
      .select("*")
      .eq("code", code)
      .single();

    // 如果查询出错或邀请码不存在
    if (error || !invite) {
      return NextResponse.json({
        success: false,
        status: "invalid",
        message: "邀请码不存在",
      });
    }

    // 检查是否过期（只检查 expires_at，忽略其他字段）
    if (invite.expires_at) {
      const expiresAt = new Date(invite.expires_at);
      const now = new Date();
      if (now > expiresAt) {
        return NextResponse.json({
          success: false,
          status: "expired",
          message: "邀请码已过期",
        });
      }
    }

    // 邀请码存在且未过期，返回成功
    // 注意：忽略 used, redeemed, redeemed_by, uses_count, max_uses 等所有字段
    return NextResponse.json({
      success: true,
      status: "valid",
      message: "邀请码有效",
      invite: invite,
    });
  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json(
      {
        success: false,
        status: "invalid",
        message: err instanceof Error ? err.message : "服务器内部错误",
      },
      { status: 500 }
    );
  }
}












