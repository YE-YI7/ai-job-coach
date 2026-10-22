import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { analyticsCohort } from "@/lib/analytics-cohort";
import { sanitizeAcquisitionProperties } from "@/lib/acquisition";
import {
  buildProductEventWrite,
  isProductEventName,
  normalizeAnonId,
  sanitizeEventProperties,
} from "@/lib/product-events";
import { isServerResumeEvent, prepareClientDeliveryEvent, CLIENT_RESUME_EVENTS, ENTRY_EVENTS } from "@/lib/coach-harness/resume-delivery";

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();

  const body = await request.json().catch(() => null);
  if (
    !body ||
    !isProductEventName(body.name) ||
    typeof body.clientEventId !== "string" ||
    isServerResumeEvent(body.name)
  ) {
    return NextResponse.json({ error: "事件格式无效" }, { status: 400 });
  }
  let clientEventId = body.clientEventId.slice(0, 96);
  if (!/^[a-zA-Z0-9_-]{8,96}$/.test(clientEventId)) {
    return NextResponse.json({ error: "事件标识无效" }, { status: 400 });
  }
  const anonId = normalizeAnonId(body.anonId);
  if (!userId && !anonId) {
    return NextResponse.json(
      { error: "未登录时缺少访客标识" },
      { status: 400 },
    );
  }

  const occurredAt =
    typeof body.occurredAt === "string" &&
    !Number.isNaN(Date.parse(body.occurredAt))
      ? new Date(body.occurredAt).toISOString()
      : new Date().toISOString();
  const db = await getDbClient();
  if (!db)
    return NextResponse.json({ error: "事件服务暂不可用" }, { status: 503 });

  const clientDelivery = (CLIENT_RESUME_EVENTS as readonly string[]).includes(body.name) || (ENTRY_EVENTS as readonly string[]).includes(body.name);
  const prepared = clientDelivery ? prepareClientDeliveryEvent(body.name, clientEventId, body.properties && typeof body.properties === "object" ? body.properties as Record<string, unknown> : {}) : null;
  if (prepared && "error" in prepared) return NextResponse.json({ error: prepared.error }, { status: 400 });
  if (prepared && !("error" in prepared)) {
    clientEventId = prepared.clientEventId;
    if (!/^[a-zA-Z0-9_-]{8,96}$/.test(clientEventId)) return NextResponse.json({ error: "事件标识无效" }, { status: 400 });
  }
  if ((CLIENT_RESUME_EVENTS as readonly string[]).includes(body.name)) {
    if(!userId)return NextResponse.json({error:"请先登录"},{status:401});
    const safe=prepared&&!("error" in prepared)?prepared.properties:null;
    const {data,error}=await db.from('product_events').select('properties').eq('user_id',userId).eq('event_name','resume_task_outcome')
      .eq('properties->>generation_id',safe?.generation_id).limit(1).maybeSingle();
    if(error)return NextResponse.json({error:"交付记录暂不可读"},{status:503});
    if(Number(data?.properties?.schema_version)!==2||data?.properties?.persistence!=='confirmed')return NextResponse.json({error:"没有本账号的交付记录"},{status:403});
    if(body.name==='resume_change_decided'&&!String(data.properties.change_ids||'').split(',').includes(String(safe?.change_id)))return NextResponse.json({error:"修改编号不属于本次交付"},{status:403});
  }
  const { row, onConflict } = buildProductEventWrite({
    userId,
    anonId,
    name: body.name,
    clientEventId,
    occurredAt,
    properties: {
      ...sanitizeAcquisitionProperties(prepared && !("error" in prepared) ? prepared.properties : sanitizeEventProperties(body.properties)),
      account_cohort: analyticsCohort(
        userId,
        process.env.ANALYTICS_INTERNAL_USER_IDS,
        anonId,
        process.env.ANALYTICS_INTERNAL_ANON_IDS,
      ),
      host: request.nextUrl.hostname,
      environment: process.env.VERCEL_ENV || "development",
    },
  });
  const { error } = await db
    .from("product_events")
    .upsert(row, { onConflict, ignoreDuplicates: true });

  if (error) {
    console.error("Product event insert failed", {
      eventName: body.name,
      code: error.code,
    });
    return NextResponse.json({ error: "事件记录失败" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
