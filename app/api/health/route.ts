import { NextResponse } from "next/server";

// 必须使用 Node.js runtime
export const runtime = "nodejs";

/**
 * GET /api/health
 * 健康检查端点，用于 Railway 部署
 */
export async function GET() {
  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}


