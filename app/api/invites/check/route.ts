import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";

export const runtime = "nodejs";

type InviteStatus = "valid" | "remaining" | "expired" | "redeemed" | "invalid";

function evaluateInviteStatus(invite: any): { status: InviteStatus; message: string } {
  if (invite.used === true) {
    return { status: "redeemed", message: "邀请码已被使用" };
  }

  if (invite.expires_at && new Date() > new Date(invite.expires_at)) {
    return { status: "expired", message: "邀请码已过期" };
  }

  if (invite.max_uses && invite.uses_count !== undefined) {
    const remaining = invite.max_uses - invite.uses_count;
    if (remaining <= 0) {
      return { status: "redeemed", message: "邀请码使用次数已用完" };
    }
    return {
      status: remaining === 1 ? "remaining" : "valid",
      message: `邀请码有效，剩余 ${remaining} 次使用`,
    };
  }

  return { status: "valid", message: "邀请码有效" };
}

/**
 * GET /api/invites/check?code=ABC12345
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code || code.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "缺少 code 参数" }, { status: 400 });
    }

    const client = await getDbClient();
    if (!client) {
      return NextResponse.json({ ok: false, error: "服务暂不可用" }, { status: 503 });
    }

    const { data: invite, error } = await client
      .from("invites")
      .select("*")
      .eq("code", code.trim())
      .single();

    if (error || !invite) {
      return NextResponse.json({
        ok: true,
        status: "invalid" as InviteStatus,
        code: code.trim(),
        message: "邀请码不存在",
      });
    }

    const { status, message } = evaluateInviteStatus(invite);

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
  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/invites/check
 */
export async function POST(request: Request) {
  try {
    let body = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "无效的 JSON 请求体" }, { status: 400 });
    }

    if (body?.apiKey || body?.key || body?.token) {
      return NextResponse.json({ ok: false, error: "Client is not allowed to send LLM keys." }, { status: 400 });
    }

    if (!body?.code) {
      return NextResponse.json({ ok: false, error: "code 是必填字段" }, { status: 400 });
    }

    const client = await getDbClient();
    if (!client) {
      return NextResponse.json({ ok: false, error: "服务暂不可用" }, { status: 503 });
    }

    const { data: invite, error } = await client
      .from("invites")
      .select("*")
      .eq("code", body.code.trim())
      .single();

    if (error || !invite) {
      return NextResponse.json({
        ok: true,
        status: "invalid" as InviteStatus,
        code: body.code.trim(),
        message: "邀请码不存在",
      });
    }

    const { status, message } = evaluateInviteStatus(invite);

    return NextResponse.json({
      ok: true,
      status,
      code: body.code.trim(),
      message,
      data: {
        created_at: invite.created_at,
        expires_at: invite.expires_at || null,
        used: invite.used || false,
        uses_count: invite.uses_count || 0,
        max_uses: invite.max_uses || null,
      },
    });
  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
