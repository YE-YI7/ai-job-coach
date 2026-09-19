import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { buildProductEventWrite, isProductEventName, normalizeAnonId, sanitizeEventProperties } from "@/lib/product-events";

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();

  const body = await request.json().catch(() => null);
  if (!body || !isProductEventName(body.name) || typeof body.clientEventId !== "string") {
    return NextResponse.json({ error: "事件格式无效" }, { status: 400 });
  }
  const clientEventId = body.clientEventId.slice(0, 96);
  if (!/^[a-zA-Z0-9_-]{8,96}$/.test(clientEventId)) {
    return NextResponse.json({ error: "事件标识无效" }, { status: 400 });
  }
  const anonId = normalizeAnonId(body.anonId);
  if (!userId && !anonId) {
    return NextResponse.json({ error: "未登录时缺少访客标识" }, { status: 400 });
  }

  const occurredAt = typeof body.occurredAt === "string" && !Number.isNaN(Date.parse(body.occurredAt))
    ? new Date(body.occurredAt).toISOString()
    : new Date().toISOString();
  const db = await getDbClient();
  if (!db) return NextResponse.json({ error: "事件服务暂不可用" }, { status: 503 });

  const { row, onConflict } = buildProductEventWrite({
    userId,
    anonId,
    name: body.name,
    clientEventId,
    occurredAt,
    properties: sanitizeEventProperties(body.properties),
  });
  const { error } = await db.from("product_events").upsert(row, { onConflict, ignoreDuplicates: true });

  if (error) {
    console.error("Product event insert failed", { eventName: body.name, code: error.code });
    return NextResponse.json({ error: "事件记录失败" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
