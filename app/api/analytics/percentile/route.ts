/**
 * 数据飞轮 - 百分位排名 API
 * GET /api/analytics/percentile
 * 
 * 查询用户在某个指标上的百分位排名
 */

import { NextRequest, NextResponse } from "next/server";
import { getPercentileRank, getUserStageSummary } from "@/lib/analytics";
import type { AnalyticsStage, MetricType } from "@/lib/analytics";

function getUserId(request: NextRequest): string | null {
  return request.cookies.get("sb-session-user-id")?.value || null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const stage = searchParams.get("stage") as AnalyticsStage;
    const metricType = searchParams.get("metric") as MetricType;

    if (!stage || !metricType) {
      return NextResponse.json(
        { error: "缺少 stage 或 metric 参数" },
        { status: 400 }
      );
    }

    const [percentileData, summaryData] = await Promise.all([
      getPercentileRank(userId, stage, metricType),
      getUserStageSummary(userId, stage),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        percentile: percentileData,
        summary: summaryData,
      },
    });
  } catch (err: any) {
    console.error("Analytics percentile error:", err);
    return NextResponse.json({ error: err.message || "服务器错误" }, { status: 500 });
  }
}
