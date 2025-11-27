import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateInviteCode } from "@/lib/inviteCode";

// 必须使用 Node.js runtime（仅 server-side）
export const runtime = "nodejs";

/**
 * POST /api/admin/invites/generate
 * 生成指定数量的邀请码并写入 invites 表
 * 
 * 请求体：
 * {
 *   "count": 10,      // 要生成的邀请码数量
 *   "max_uses": 1     // 每个邀请码的最大使用次数（可选，默认为 1）
 * }
 * 
 * 返回：
 * {
 *   "ok": true,
 *   "codes": ["ABC12345", "XYZ67890", ...],
 *   "count": 10
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

    const { count, max_uses } = body;

    // 验证 count 参数（支持字符串数字转换）
    let countNum: number;
    if (typeof count === "string") {
      countNum = parseInt(count, 10);
      if (isNaN(countNum)) {
        return NextResponse.json(
          {
            ok: false,
            error: "count 必须是 1-100 之间的数字",
          },
          { status: 400 }
        );
      }
    } else if (typeof count === "number") {
      countNum = count;
    } else {
      return NextResponse.json(
        {
          ok: false,
          error: "count 必须是 1-100 之间的数字",
        },
        { status: 400 }
      );
    }

    // 验证 count 范围
    if (countNum <= 0 || countNum > 100) {
      return NextResponse.json(
        {
          ok: false,
          error: "count 必须是 1-100 之间的数字",
        },
        { status: 400 }
      );
    }

    // 验证 max_uses 参数（可选，默认为 1）
    let maxUsesNum: number = 1;
    if (max_uses !== undefined) {
      if (typeof max_uses === "string") {
        maxUsesNum = parseInt(max_uses, 10);
        if (isNaN(maxUsesNum) || maxUsesNum < 1) {
          return NextResponse.json(
            {
              ok: false,
              error: "max_uses 必须是大于等于 1 的数字",
            },
            { status: 400 }
          );
        }
      } else if (typeof max_uses === "number") {
        if (max_uses < 1) {
          return NextResponse.json(
            {
              ok: false,
              error: "max_uses 必须是大于等于 1 的数字",
            },
            { status: 400 }
          );
        }
        maxUsesNum = max_uses;
      } else {
        return NextResponse.json(
          {
            ok: false,
            error: "max_uses 必须是大于等于 1 的数字",
          },
          { status: 400 }
        );
      }
    }

    // 创建 Supabase 客户端（使用 Service Role Key，具有完整权限）
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 生成邀请码并检查唯一性
    const codes: string[] = [];
    const existingCodes = new Set<string>();

    // 先查询已存在的邀请码（避免重复）
    const { data: existingInvites } = await supabase
      .from("invites")
      .select("code");

    if (existingInvites) {
      existingInvites.forEach((invite: any) => {
        if (invite.code) {
          existingCodes.add(invite.code);
        }
      });
    }

    // 生成唯一邀请码（使用项目统一的生成函数，8位长度）
    while (codes.length < countNum) {
      let code = generateInviteCode(8);
      let attempts = 0;
      
      // 确保生成的邀请码是唯一的
      while (existingCodes.has(code) && attempts < 100) {
        code = generateInviteCode(8);
        attempts++;
      }

      if (attempts >= 100) {
        return NextResponse.json(
          {
            ok: false,
            error: "无法生成唯一邀请码，请稍后重试",
          },
          { status: 500 }
        );
      }

      codes.push(code);
      existingCodes.add(code);
    }

    // 批量插入邀请码到数据库
    const invitesToInsert = codes.map((code) => ({
      code,
      used: false,
      uses_count: 0,
      max_uses: maxUsesNum,
      created_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from("invites")
      .insert(invitesToInsert)
      .select("code");

    if (error) {
      console.error("插入邀请码失败:", error);
      return NextResponse.json(
        {
          ok: false,
          error: `数据库插入失败: ${error.message}`,
        },
        { status: 500 }
      );
    }

    // 返回成功响应
    return NextResponse.json({
      ok: true,
      codes: data?.map((item: any) => item.code) || codes,
      count: data?.length || codes.length,
    });
  } catch (error) {
    console.error("生成邀请码失败:", error);
    return NextResponse.json(
      {
        ok: false,
        error: `服务器错误: ${error instanceof Error ? error.message : "未知错误"}`,
      },
      { status: 500 }
    );
  }
}

