import { getDbClient } from "@/lib/db";
import {
  evalAdminAccess,
  evalJson as json,
} from "@/lib/coach-harness/eval-admin-http";
import {
  DETAIL_KINDS,
  readAnalyticsDetail,
  readAnalyticsSummary,
  type AnalyticsDetailKind,
} from "@/lib/admin-analytics-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export async function GET(request: Request) {
  const { error } = await evalAdminAccess();
  if (error) return error;
  const params = new URL(request.url).searchParams;
  const days = Number(params.get("days") || "30"),
    userId = params.get("userId"),
    kind = params.get("kind") || "turns";
  const offset = Number(params.get("offset") || "0"),
    opportunityId = params.get("opportunityId");
  if (
    ![7, 30, 90].includes(days) ||
    (userId && !uuid.test(userId)) ||
    !DETAIL_KINDS.includes(kind as AnalyticsDetailKind) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 10000 ||
    (opportunityId && !uuid.test(opportunityId)) ||
    (kind === "material" && (!userId || !opportunityId))
  )
    return json({ error: "查询条件无效" }, 400);
  try {
    const db = await getDbClient();
    if (!db) throw Error("unavailable");
    if (userId) {
      const detail = await readAnalyticsDetail(
        db,
        userId,
        kind as AnalyticsDetailKind,
        offset,
        opportunityId,
      );
      return detail
        ? json({ ok: true, detail })
        : json({ error: "用户不存在" }, 404);
    }
    return json({ ok: true, summary: await readAnalyticsSummary(db, days) });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error && e.message === "analytics_capacity"
            ? "范围内数据过多，请缩小到近 7 天；没有显示截断统计。"
            : "数据暂时无法读取，请重试；没有把读取失败显示为 0。",
      },
      503,
    );
  }
}
