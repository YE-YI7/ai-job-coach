export const runtime = "nodejs";

import { NextResponse } from "next/server";

/**
 * GET /api/health
 * 健康检查端点，用于调试和部署监控
 */
export async function GET() {
  return NextResponse.json({ ok: true });
}



