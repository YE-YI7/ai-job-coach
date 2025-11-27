import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 必须使用 Node.js runtime（仅 server-side）
export const runtime = "nodejs";

/**
 * 邀请码状态类型
 */
type InviteStatus = "valid" | "remaining" | "expired" | "redeemed" | "invalid";

/**
 * GET /api/invites/check
 * 检查邀请码状态
 * 允许 anonymous 访问
 * 
 * 查询参数：
 * ?code=ABC12345
 * 
 * 返回：
 * {
 *   "ok": true,
 *   "status": "valid" | "remaining" | "expired" | "redeemed" | "invalid",
 *   "code": "ABC12345",
 *   "message": "状态描述"
 * }
 */
export async function GET(request: Request) {
  try {
    // 检查环境变量
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "SUPABASE_URL 或 SUPABASE_ANON_KEY 未配置",
        },
        { status: 500 }
      );
    }

    // 解析查询参数
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code || typeof code !== "string" || code.trim().length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "缺少 code 参数",
        },
        { status: 400 }
      );
    }

    // 创建 Supabase 客户端（使用 Anon Key，允许 anonymous 访问）
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 查询邀请码
    const { data: invite, error } = await supabase
      .from("invites")
      .select("*")
      .eq("code", code.trim())
      .single();

    // 如果查询出错或邀请码不存在
    if (error || !invite) {
      return NextResponse.json({
        ok: true,
        status: "invalid" as InviteStatus,
        code: code.trim(),
        message: "邀请码不存在",
      });
    }

    // 判断邀请码状态
    let status: InviteStatus;
    let message: string;

    // 检查是否已使用
    if (invite.used === true) {
      status = "redeemed";
      message = "邀请码已被使用";
    }
    // 检查是否过期（如果有 expires_at 字段）
    else if (invite.expires_at) {
      const expiresAt = new Date(invite.expires_at);
      const now = new Date();
      if (now > expiresAt) {
        status = "expired";
        message = "邀请码已过期";
      } else {
        // 检查剩余使用次数（如果有 max_uses 和 uses_count 字段）
        if (invite.max_uses && invite.uses_count !== undefined) {
          const remaining = invite.max_uses - invite.uses_count;
          if (remaining <= 0) {
            status = "redeemed";
            message = "邀请码使用次数已用完";
          } else if (remaining === 1) {
            status = "remaining";
            message = `邀请码有效，剩余 ${remaining} 次使用`;
          } else {
            status = "valid";
            message = `邀请码有效，剩余 ${remaining} 次使用`;
          }
        } else {
          // 没有使用次数限制，直接返回 valid
          status = "valid";
          message = "邀请码有效";
        }
      }
    }
    // 检查剩余使用次数（如果没有过期时间但有使用次数限制）
    else if (invite.max_uses && invite.uses_count !== undefined) {
      const remaining = invite.max_uses - invite.uses_count;
      if (remaining <= 0) {
        status = "redeemed";
        message = "邀请码使用次数已用完";
      } else if (remaining === 1) {
        status = "remaining";
        message = `邀请码有效，剩余 ${remaining} 次使用`;
      } else {
        status = "valid";
        message = `邀请码有效，剩余 ${remaining} 次使用`;
      }
    }
    // 默认：有效
    else {
      status = "valid";
      message = "邀请码有效";
    }

    // 返回状态信息
    return NextResponse.json({
      ok: true,
      status,
      code: code.trim(),
      message,
      // 可选：返回额外信息
      data: {
        created_at: invite.created_at,
        expires_at: invite.expires_at || null,
        used: invite.used || false,
        uses_count: invite.uses_count || 0,
        max_uses: invite.max_uses || null,
      },
    });
  } catch (error) {
    console.error("检查邀请码失败:", error);
    return NextResponse.json(
      {
        ok: false,
        error: `服务器错误: ${error instanceof Error ? error.message : "未知错误"}`,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/invites/check
 * 也支持 POST 方式（请求体传参）
 * 
 * 请求体：
 * {
 *   "code": "ABC12345"
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
          ok: false,
          error: "SUPABASE_URL 或 SUPABASE_ANON_KEY 未配置",
        },
        { status: 500 }
      );
    }

    // 解析请求体
    let body: any = {};
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "请求体格式错误，需要有效的 JSON",
        },
        { status: 400 }
      );
    }

    const { code } = body;

    if (!code || typeof code !== "string" || code.trim().length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "缺少 code 字段",
        },
        { status: 400 }
      );
    }

    // 创建 Supabase 客户端（使用 Anon Key，允许 anonymous 访问）
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 查询邀请码
    const { data: invite, error } = await supabase
      .from("invites")
      .select("*")
      .eq("code", code.trim())
      .single();

    // 如果查询出错或邀请码不存在
    if (error || !invite) {
      return NextResponse.json({
        ok: true,
        status: "invalid" as InviteStatus,
        code: code.trim(),
        message: "邀请码不存在",
      });
    }

    // 判断邀请码状态（与 GET 方法相同的逻辑）
    let status: InviteStatus;
    let message: string;

    if (invite.used === true) {
      status = "redeemed";
      message = "邀请码已被使用";
    } else if (invite.expires_at) {
      const expiresAt = new Date(invite.expires_at);
      const now = new Date();
      if (now > expiresAt) {
        status = "expired";
        message = "邀请码已过期";
      } else {
        if (invite.max_uses && invite.uses_count !== undefined) {
          const remaining = invite.max_uses - invite.uses_count;
          if (remaining <= 0) {
            status = "redeemed";
            message = "邀请码使用次数已用完";
          } else if (remaining === 1) {
            status = "remaining";
            message = `邀请码有效，剩余 ${remaining} 次使用`;
          } else {
            status = "valid";
            message = `邀请码有效，剩余 ${remaining} 次使用`;
          }
        } else {
          status = "valid";
          message = "邀请码有效";
        }
      }
    } else if (invite.max_uses && invite.uses_count !== undefined) {
      const remaining = invite.max_uses - invite.uses_count;
      if (remaining <= 0) {
        status = "redeemed";
        message = "邀请码使用次数已用完";
      } else if (remaining === 1) {
        status = "remaining";
        message = `邀请码有效，剩余 ${remaining} 次使用`;
      } else {
        status = "valid";
        message = `邀请码有效，剩余 ${remaining} 次使用`;
      }
    } else {
      status = "valid";
      message = "邀请码有效";
    }

    // 返回状态信息
    return NextResponse.json({
      ok: true,
      status,
      code: code.trim(),
      message,
      data: {
        created_at: invite.created_at,
        expires_at: invite.expires_at || null,
        used: invite.used || false,
        uses_count: invite.uses_count || 0,
        max_uses: invite.max_uses || null,
      },
    });
  } catch (error) {
    console.error("检查邀请码失败:", error);
    return NextResponse.json(
      {
        ok: false,
        error: `服务器错误: ${error instanceof Error ? error.message : "未知错误"}`,
      },
      { status: 500 }
    );
  }
}


