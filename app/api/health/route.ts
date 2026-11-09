export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";
import { f6RuntimeIdentity } from '@/lib/coach-harness/f6-runtime-contract';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 * 健康检查端点，用于调试和部署监控
 */
export async function GET() {
  const db = await getDbClient();
  if (!db) return NextResponse.json({ ok: false, database: "unconfigured" }, { status: 503 });
  const { error } = await db.from("users").select("id", { head: true, count: "exact" }).limit(1);
  if (error) return NextResponse.json({ ok: false, database: "unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true, database: "ok", resumeRuntime: f6RuntimeIdentity() },
    {headers: {'Cache-Control': 'no-store'}});
}


