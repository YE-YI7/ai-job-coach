import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "该旧版评分接口已停用，请从模拟面试工作台开始一次有上下文的面试。",
      replacement: "/cockpit?tab=interview",
    },
    { status: 410 },
  );
}
