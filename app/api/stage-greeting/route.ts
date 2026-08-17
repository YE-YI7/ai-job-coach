import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

const greetings: Record<string, string> = {
  career_planning: "先确认你想去的岗位，再决定今天补哪一块证据。",
  project_review: "选一段最能证明能力的经历，我们把过程和结果讲清楚。",
  resume_optimization: "先对齐目标岗位，再改最影响筛选结果的内容。",
  application_strategy: "先看岗位值不值得投，再安排投递顺序。",
  interview: "先确定面试轮次和岗位，我会按真实节奏陪你练。",
  salary_talk: "先梳理底线、目标和可交换条件，再准备谈判。",
  offer: "把选择标准和真实约束列出来，我们逐项比较。",
};

export async function POST(req: Request) {
  try {
    if (!(await getCurrentUserFromRequest())) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }
    // 解析请求体
    let body = null;
    try {
      body = await req.json();
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON payload" },
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

    // 校验 stage 是否存在
    if (!body?.stage || typeof body.stage !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid 'stage' field" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      result: greetings[body.stage] || "先告诉我你现在最急的求职问题，我帮你排出下一步。"
    });
  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
