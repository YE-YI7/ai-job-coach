/**
 * 数据飞轮 - 数据记录 API
 * POST /api/analytics/record
 * 
 * 记录用户行为数据点
 */

import { NextRequest, NextResponse } from "next/server";
import { recordMetric } from "@/lib/analytics";
import type { AnalyticsStage, MetricType } from "@/lib/analytics";
import { getCurrentUserId } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const { stage, metricType, metricValue, metadata } = body;

    if (!stage || !metricType || metricValue === undefined) {
      return NextResponse.json(
        { error: "缺少必要参数: stage, metricType, metricValue" },
        { status: 400 }
      );
    }

    const success = await recordMetric({
      user_id: userId,
      stage: stage as AnalyticsStage,
      metric_type: metricType as MetricType,
      metric_value: Number(metricValue),
      metadata: metadata || {},
    });

    return NextResponse.json({ ok: success });
  } catch (err: any) {
    console.error("Analytics record error:", err);
    return NextResponse.json({ error: err.message || "服务器错误" }, { status: 500 });
  }
}
