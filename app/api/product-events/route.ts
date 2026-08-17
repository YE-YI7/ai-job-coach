import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { isProductEventName, sanitizeEventProperties } from "@/lib/product-events";

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || !isProductEventName(body.name) || typeof body.clientEventId !== "string") {
    return NextResponse.json({ error: "事件格式无效" }, { status: 400 });
  }
  const clientEventId = body.clientEventId.slice(0, 96);
  if (!/^[a-zA-Z0-9_-]{8,96}$/.test(clientEventId)) {
    return NextResponse.json({ error: "事件标识无效" }, { status: 400 });
  }

  const occurredAt = typeof body.occurredAt === "string" && !Number.isNaN(Date.parse(body.occurredAt))
    ? new Date(body.occurredAt).toISOString()
    : new Date().toISOString();
  const db = await getDbClient();
  if (!db) return NextResponse.json({ error: "事件服务暂不可用" }, { status: 503 });

  const { error } = await db.from("product_events").upsert({
    user_id: userId,
    event_name: body.name,
    client_event_id: clientEventId,
    occurred_at: occurredAt,
    properties: sanitizeEventProperties(body.properties),
  }, { onConflict: "user_id,client_event_id", ignoreDuplicates: true });

  if (error) {
    console.error("Product event insert failed", { eventName: body.name, code: error.code });
    return NextResponse.json({ error: "事件记录失败" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
