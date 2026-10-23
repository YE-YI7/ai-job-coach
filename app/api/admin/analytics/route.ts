import { getDbClient } from "@/lib/db";
import { evalAdminAccess, evalJson as json, } from "@/lib/coach-harness/eval-admin-http";
import { DETAIL_KINDS, readAnalyticsDetail, readAnalyticsSummary, type AnalyticsDetailKind, } from "@/lib/admin-analytics-store";
import { readBusinessDataset, readBusinessSessions, readBusinessMaterial } from "@/lib/admin-analytics-business-store";
import { businessWindow, FEATURES, STAGES,isKnownBusinessEvent } from "@/lib/admin-analytics-business";
import { isAcquisitionSource } from "@/lib/acquisition";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export async function GET(request: Request) {
    const { error } = await evalAdminAccess();
    if (error)
        return error;
    const params = new URL(request.url).searchParams;
    const view = params.get("view");
    if (view) {
        if (!["daily", "sessions", "users", "material"].includes(view))
            return json({ error: "查询条件无效" }, 400);
        const from = params.get("from") || "";
        const to = params.get("to") || "";
        const feature = params.get("feature") || undefined;
        const userId = params.get("userId");
        try {
            const asOf = params.get("asOf") || undefined;
            businessWindow(from, to, new Date(), asOf);
            const offset = Number(params.get("offset") || "0");
            const sessionOffset = Number(params.get("sessionOffset") || "0"), eventOffset = Number(params.get("eventOffset") || "0");
            const search = params.get("search") || undefined, cohort = params.get("cohort") || undefined, scope = params.get("scope") || undefined, stage = params.get("stage") || undefined, source = params.get("source") || undefined, sort = params.get("sort") || undefined;
            const minRounds = params.has("minRounds") ? Number(params.get("minRounds")) : undefined, maxRounds = params.has("maxRounds") ? Number(params.get("maxRounds")) : undefined;
            const session = params.get("session") || undefined, full = params.get("full") === "1", opportunityId = params.get("opportunityId");
            if ([offset, sessionOffset, eventOffset].some(n => !Number.isSafeInteger(n) || n < 0 || n > 10000) || (userId && !uuid.test(userId)) || (search && !uuid.test(search)) || (opportunityId && !uuid.test(opportunityId)) || (feature && feature.split(",").some(f => !Object.hasOwn(FEATURES, f) && !isKnownBusinessEvent(f))) || (cohort && !["new", "old", "unknown"].includes(cohort)) || (scope && !["all", "active", "registered"].includes(scope)) || (stage && !Object.hasOwn(STAGES, stage)) || (source && !isAcquisitionSource(source)) || (sort && !["recent", "registered", "rounds"].includes(sort)) || [minRounds, maxRounds].some(n => n !== undefined && (!Number.isSafeInteger(n) || n < 0 || n > 100000)) || (minRounds !== undefined && maxRounds !== undefined && minRounds > maxRounds) || (session && !/^[a-zA-Z0-9:_-]{1,160}$/.test(session)) || (full && !session) || (view === "material" && (!userId || !opportunityId)))
                return json({ error: "查询条件无效" }, 400);
            const db = await getDbClient();
            if (!db)
                throw Error("unavailable");
            if (view === "material") {
                const material = await readBusinessMaterial(db, userId!, opportunityId!);
                return material ? json({ ok: true, material }) : json({ error: "材料不存在或不在可查看范围" }, 404);
            }
            if (view === "sessions" && userId) {
                const sessions = await readBusinessSessions(db, userId, from, to, { asOf, offset, sessionOffset, eventOffset, session, full });
                return sessions ? json({ ok: true, sessions }) : json({ error: "用户或会话不存在，或已被排除" }, 404);
            }
            return json({ ok: true, dataset: await readBusinessDataset(db, from, to, feature, offset, { asOf, userId: search, cohort, scope, stage, source, sort, minRounds, maxRounds }) });
        }
        catch (e) {
            const code = e instanceof Error ? e.message : "";
            if (["invalid_date", "invalid_asof"].includes(code))
                return json({ error: "日期或读取快照无效。请选择过去日期；可点刷新重新读取。" }, 400);
            return json({ error: code === "analytics_capacity" ? "范围超过读取预算（最多62天），请缩小日期；未返回截断统计。" : code === "analytics_exclusions_missing" ? "生产环境缺少排除配置，没有返回统计。" : "数据暂时无法读取，请重试；没有把读取失败显示为 0。" }, 503);
        }
    }
    const days = Number(params.get("days") || "30"), userId = params.get("userId"), kind = params.get("kind") || "turns";
    const offset = Number(params.get("offset") || "0"), opportunityId = params.get("opportunityId");
    if (![7, 30, 90].includes(days) ||
        (userId && !uuid.test(userId)) ||
        !DETAIL_KINDS.includes(kind as AnalyticsDetailKind) ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset > 10000 ||
        (opportunityId && !uuid.test(opportunityId)) ||
        (kind === "material" && (!userId || !opportunityId)))
        return json({ error: "查询条件无效" }, 400);
    try {
        const db = await getDbClient();
        if (!db)
            throw Error("unavailable");
        if (userId) {
            const detail = await readAnalyticsDetail(db, userId, kind as AnalyticsDetailKind, offset, opportunityId);
            return detail
                ? json({ ok: true, detail })
                : json({ error: "用户不存在" }, 404);
        }
        return json({ ok: true, summary: await readAnalyticsSummary(db, days) });
    }
    catch (e) {
        return json({
            error: e instanceof Error && e.message === "analytics_capacity"
                ? "范围内数据过多，请缩小到近 7 天；没有显示截断统计。"
                : "数据暂时无法读取，请重试；没有把读取失败显示为 0。",
        }, 503);
    }
}
