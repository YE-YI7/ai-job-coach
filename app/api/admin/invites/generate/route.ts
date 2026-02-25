import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";
import { generateInviteCode } from "@/lib/inviteCode";

export const runtime = "nodejs";

/**
 * POST /api/admin/invites/generate
 * 生成指定数量的邀请码并写入 invites 表
 * 
 * 请求体：{ "count": 10, "max_uses": 1 }
 * 返回：{ "ok": true, "codes": [...], "count": 10 }
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

    const { count, max_uses } = requestBody;

    // 验证 count 参数
    let countNum: number;
    if (typeof count === "string") {
      countNum = parseInt(count, 10);
      if (isNaN(countNum)) {
        return NextResponse.json(
          { ok: false, error: "count 必须是 1-100 之间的数字" },
          { status: 400 }
        );
      }
    } else if (typeof count === "number") {
      countNum = count;
    } else {
      return NextResponse.json(
        { ok: false, error: "count 必须是 1-100 之间的数字" },
        { status: 400 }
      );
    }

    if (countNum <= 0 || countNum > 100) {
      return NextResponse.json(
        { ok: false, error: "count 必须是 1-100 之间的数字" },
        { status: 400 }
      );
    }

    // 验证 max_uses 参数
    let maxUsesNum: number = 1;
    if (max_uses !== undefined) {
      if (typeof max_uses === "string") {
        maxUsesNum = parseInt(max_uses, 10);
        if (isNaN(maxUsesNum) || maxUsesNum < 1) {
          return NextResponse.json(
            { ok: false, error: "max_uses 必须是大于等于 1 的数字" },
            { status: 400 }
          );
        }
      } else if (typeof max_uses === "number") {
        if (max_uses < 1) {
          return NextResponse.json(
            { ok: false, error: "max_uses 必须是大于等于 1 的数字" },
            { status: 400 }
          );
        }
        maxUsesNum = max_uses;
      } else {
        return NextResponse.json(
          { ok: false, error: "max_uses 必须是大于等于 1 的数字" },
          { status: 400 }
        );
      }
    }

    const client = await getDbClient();
    if (!client) {
      return NextResponse.json(
        { ok: false, error: "数据库服务暂不可用" },
        { status: 503 }
      );
    }

    // 查询已存在的邀请码
    const existingCodes = new Set<string>();
    const { data: existingInvites } = await client
      .from("invites")
      .select("code");

    if (existingInvites) {
      existingInvites.forEach((invite: any) => {
        if (invite.code) existingCodes.add(invite.code);
      });
    }

    // 生成唯一邀请码
    const codes: string[] = [];
    while (codes.length < countNum) {
      let code = generateInviteCode(8);
      let attempts = 0;

      while (existingCodes.has(code) && attempts < 100) {
        code = generateInviteCode(8);
        attempts++;
      }

      if (attempts >= 100) {
        return NextResponse.json(
          { ok: false, error: "无法生成唯一邀请码，请稍后重试" },
          { status: 500 }
        );
      }

      codes.push(code);
      existingCodes.add(code);
    }

    // 批量插入邀请码
    const invitesToInsert = codes.map((code) => ({
      code,
      used: false,
      uses_count: 0,
      max_uses: maxUsesNum,
      created_at: new Date().toISOString(),
    }));

    const { data, error } = await client
      .from("invites")
      .insert(invitesToInsert)
      .select("code");

    if (error) {
      console.error("插入邀请码失败:", error);
      return NextResponse.json(
        { ok: false, error: `数据库插入失败: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      codes: data?.map((item: any) => item.code) || codes,
      count: data?.length || codes.length,
    });
  } catch (error) {
    console.error("生成邀请码失败:", error);
    return NextResponse.json(
      { ok: false, error: `服务器错误: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 }
    );
  }
}
