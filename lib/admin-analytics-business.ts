import { analyticsDay, isActivityEvent as legacyActivityEvent, isExcludedEvent, EVENT_LABELS, summarizeResumeDelivery, type AnalyticsEvent } from "./admin-analytics";
export const BUSINESS_QUERY_VERSION = "business-v2";
export const BUSINESS_DURATION_VERSION = "per-user-midnight-split-v2";
export const DAY = 86400000, MAX_DAYS = 62;
export interface BusinessWindow {
    timezone: "Asia/Shanghai";
    from: string;
    to: string;
    start: string;
    end: string;
    asOf: string;
    version: string;
}
export interface BusinessAccount {
    id: string;
    createdAt: string | null;
    provider: string | null;
}
export interface BusinessTurn {
    id: string;
    userId: string;
    sessionId: string | null;
    requestId?: string | null;
    createdAt: string;
    role: "user" | "mentor";
    status: "sent" | "replied" | "failed" | "unknown";
    text: string;
    opportunityId?: string | null;
    taskId?: string;
    stage?: string | null;
    truncated?: boolean;
    metricEligible?:boolean;
}
export interface BusinessFilters {
    feature?: string;
    cohort?: string;
    scope?: string;
    userId?: string;
    stage?: string;
    minRounds?: number;
    maxRounds?: number;
    source?: string;
    sort?: string;
}
export interface BusinessJob {
    id: string;
    userId: string;
    stage: string | null;
    company?: string;
    role?: string;
}
export interface BusinessEvent extends AnalyticsEvent {
    request_id?:string|null;
    trace_id?: string | null;
    eval_run_id?: string | null;
    task_id?: string | null;
    opportunity_id?: string | null;
    change_ids?: string | null;
}
export const FEATURES = { resume: { label: "简历", events: /^(resume_|material_intake_)/ }, mentor: { label: "导师对话", events: /^coach_response_/ }, jobs: { label: "岗位", events: /^(opportunity_|job_|recommendation_)/ }, interview: { label: "模拟面试", events: /^(mock_interview_|interview_practice_)/ }, review: { label: "面试复盘", events: /^interview_review_/ }, offer: { label: "Offer", events: /^offer_/ } };
export const STAGES: Record<string, string> = { captured: "已收集", evaluating: "评估中", preparing_application: "准备投递", applied: "已投递", interviewing: "面试中", negotiating: "谈薪中", won: "已获 Offer", lost: "未通过", withdrawn: "已撤回", archived: "已归档" };
const businessLabels:Record<string,string>={resume_agent_trace:"改稿诊断 Trace",resume_task_started:"改稿尝试",resume_task_outcome:"改稿结果",resume_result_presented:"结果已展现",resume_change_decided:"修改决定",resume_document_persisted:"确认文档保存",entry_selected:"选择起点",entry_submitted:"提交起点",entry_result_presented:"起点结果已展现",entry_failed:"起点失败"};
Object.assign(businessLabels, { companion_goal_saved: "陪伴目标已保存", companion_submission_saved: "陪伴内容已提交", companion_feedback_saved: "导师反馈已保存", companion_feedback_failed: "导师反馈未完成", companion_task_marked: "调整当前一步", companion_step_presented: "陪伴安排已展现" });
const diagnostics=new Set(["resume_agent_trace","resume_task_started","resume_task_outcome","resume_result_presented","resume_change_decided","resume_document_persisted"]);
export const isBusinessActivityEvent=(e:AnalyticsEvent)=>legacyActivityEvent(e)&&!diagnostics.has(e.event_name);
const isActivityEvent=isBusinessActivityEvent;
export const eventLabel = (name: string) => businessLabels[name]||EVENT_LABELS[name] || name;
export const isKnownBusinessEvent=(name:string)=>Object.hasOwn(businessLabels,name)||Object.hasOwn(EVENT_LABELS,name);
export const epoch = (value: string) => Date.parse(value);
export function inBusinessWindow(time: string, window: BusinessWindow) { const t = epoch(time); return Number.isFinite(t) && t >= epoch(window.start) && t < epoch(window.end); }
export function businessWindow(from: string, to: string, now = new Date(), asOf?: string): BusinessWindow {
    const pattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!pattern.test(from) || !pattern.test(to))
        throw Error("invalid_date");
    const start = epoch(`${from}T00:00:00+08:00`), last = epoch(`${to}T00:00:00+08:00`);
    if (!Number.isFinite(start) || !Number.isFinite(last) || analyticsDay(start) !== from || analyticsDay(last) !== to || from > to || to > analyticsDay(now.getTime()))
        throw Error("invalid_date");
    if ((last - start) / DAY + 1 > MAX_DAYS)
        throw Error("analytics_capacity");
    const snapshot = asOf ? epoch(asOf) : now.getTime();
    if (!Number.isFinite(snapshot) || snapshot > now.getTime() + 1000 || snapshot <= last)
        throw Error("invalid_asof");
    return { timezone: "Asia/Shanghai", from, to, start: new Date(start).toISOString(), end: new Date(Math.min(last + DAY, snapshot)).toISOString(), asOf: new Date(snapshot).toISOString(), version: BUSINESS_QUERY_VERSION };
}
export function accountAge(account: BusinessAccount, day: string, through = day): "new" | "old" | "unknown" {
    if (!account.createdAt || !Number.isFinite(epoch(account.createdAt)))
        return "unknown";
    const created = analyticsDay(account.createdAt);
    return created < day ? "old" : created <= through ? "new" : "unknown";
}
export function paginate<T>(items: T[], offset: number, limit = 20) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50)
        throw Error("invalid_offset");
    return { rows: items.slice(offset, offset + limit), total: items.length, nextOffset: offset + limit < items.length ? offset + limit : null };
}
export function uniqueTurns(turns: BusinessTurn[]) {
    const unique = new Map<string, BusinessTurn>();
    for (const t of turns) {
        const key = `${t.userId.toLowerCase()}:${t.sessionId || ""}:${t.requestId || t.id}:${t.role}`, prior = unique.get(key);
        if (!prior || (t.status === "replied" && prior.status !== "replied"))
            unique.set(key, t);
    }
    return [...unique.values()].sort((a, b) => epoch(a.createdAt) - epoch(b.createdAt) || (a.requestId === b.requestId && a.requestId ? (a.role === b.role ? 0 : a.role === "user" ? -1 : 1) : 0) || a.id.localeCompare(b.id));
}
export function countMessages(turns: BusinessTurn[]) {
    const unique = uniqueTurns(turns).filter(t=>t.metricEligible!==false), user = unique.filter(t => t.role === "user" && t.text.trim()), reply = unique.filter(t => t.role === "mentor" && t.status === "replied" && t.text.trim());
    const paired = new Set(user.filter(t => t.requestId).map(t => `${t.userId}:${t.sessionId}:${t.requestId}`));
    return { sent: user.length, replies: reply.length, completed: reply.filter(t => t.requestId && paired.has(`${t.userId}:${t.sessionId}:${t.requestId}`)).length };
}
export function observedUseSeconds(events: AnalyticsEvent[], day?: string) {
    const sorted = events.filter(e => Number.isFinite(epoch(e.created_at))).sort((a, b) => epoch(a.created_at) - epoch(b.created_at) || a.id.localeCompare(b.id));
    const start = day ? epoch(`${day}T00:00:00+08:00`) : -Infinity, end = start + DAY;
    let seconds = 0;
    for (let i = 1; i < sorted.length; i++) {
        const prev = epoch(sorted[i - 1].created_at), gap = epoch(sorted[i].created_at) - prev;
        if (gap <= 0 || gap > 1800000)
            continue;
        const until = prev + Math.min(300000, gap);
        seconds += Math.max(0, Math.min(until, day ? end : Infinity) - Math.max(prev, start)) / 1000;
    }
    return { seconds, points: day ? sorted.filter(e => analyticsDay(e.created_at) === day).length : sorted.length };
}
export function featureMatches(name: string, filter: string) { return filter.split(",").filter(Boolean).some(key => key in FEATURES ? FEATURES[key as keyof typeof FEATURES].events.test(name) : name === key); }
export function businessUsers(accounts: BusinessAccount[], events: AnalyticsEvent[], window: BusinessWindow, internal = new Set<string>(), visitors = new Set<string>(), filters: BusinessFilters = {}, turns: BusinessTurn[] = [], jobs: BusinessJob[] = []) {
    const kept = events.filter(e => inBusinessWindow(e.created_at, window) && !isExcludedEvent(e, internal, visitors)), visibleTurns = turns.filter(t => inBusinessWindow(t.createdAt, window));
    return accounts.filter(a => !internal.has(a.id.toLowerCase())).map(account => {
        const rows = kept.filter(e => e.user_id?.toLowerCase() === account.id.toLowerCase()), activity = rows.filter(isActivityEvent), chat = visibleTurns.filter(t => t.userId.toLowerCase() === account.id.toLowerCase()), metrics = countMessages(chat), ownJobs = jobs.filter(j => j.userId.toLowerCase() === account.id.toLowerCase());
        const last = activity.map(e => e.created_at).concat(chat.map(t => t.createdAt)).sort((a, b) => epoch(a) - epoch(b)).at(-1) || null, age = accountAge(account, window.from, window.to);
        const features = Object.entries(FEATURES).filter(([key, v]) => rows.some(e => v.events.test(e.event_name)) || (key === "mentor" && chat.some(t => !t.taskId)) || (key === "resume" && chat.some(t => t.taskId))).map(([key]) => key);
        return { id: account.id, age, provider: account.provider, registeredAt: account.createdAt, activeEvents: activity.length, lastEventAt: last, ...metrics, features, stages: [...new Set(ownJobs.map(j => j.stage).filter(Boolean))] as string[], active: activity.length > 0 || chat.length > 0, note: !activity.length && !chat.length && age === "new" ? "尚无观察到的使用" : null, payment: "unknown", featureMatch: !filters.feature || rows.some(e => featureMatches(e.event_name, filters.feature!)) || filters.feature.split(",").some(f => features.includes(f)) };
    }).filter(row => {
        if (filters.userId && row.id.toLowerCase() !== filters.userId.toLowerCase())
            return false;
        if (filters.cohort && row.age !== filters.cohort)
            return false;
        if (filters.stage && !row.stages.includes(filters.stage))
            return false;
        if (filters.source && !kept.some(e => e.user_id?.toLowerCase() === row.id.toLowerCase() && e.session_source === filters.source))
            return false;
        if (!row.featureMatch || row.completed < (filters.minRounds || 0) || (filters.maxRounds !== undefined && row.completed > filters.maxRounds))
            return false;
        return filters.scope === "all" ? true : filters.scope === "registered" ? row.age === "new" : filters.scope === "active" ? row.active : row.active || row.age === "new";
    }).sort((a, b) => filters.sort === "rounds" ? b.completed - a.completed || a.id.localeCompare(b.id) : filters.sort === "registered" ? (epoch(b.registeredAt || "") || 0) - (epoch(a.registeredAt || "") || 0) || a.id.localeCompare(b.id) : epoch(b.lastEventAt || "1970-01-01") - epoch(a.lastEventAt || "1970-01-01") || a.id.localeCompare(b.id));
}
export function businessResumeMetrics(all:AnalyticsEvent[],daily:AnalyticsEvent[],day:string,now:number){
    const first=all.filter(e=>String(e.schema_version)==='2'&&['resume_task_started','resume_task_outcome'].includes(e.event_name)).map(e=>e.created_at).sort()[0];
    const known=Boolean(first&&day>=analyticsDay(first)), summary=summarizeResumeDelivery(daily,now);
    const key=(e:AnalyticsEvent)=>`${e.user_id||e.event_identity}:${e.generation_id}`;
    const starts=new Set(daily.filter(e=>e.event_name==='resume_task_started'&&e.generation_id).map(key));
    const related=all.filter(e=>analyticsDay(e.created_at)===day||(e.event_name==='resume_task_outcome'&&starts.has(key(e))));
    const withLaterOutcome=summarizeResumeDelivery(related,now);
    return {resumeAttempts:known?summary.attemptsStarted:null,resumeDelivered:known?summary.retrievableComplete:null,
        resumePartial:known?summary.retrievablePartial:null,resumeFailed:known?summary.outcomes.failed:null,
        resumeBlocked:known?summary.outcomes.blocked:null,resumeUnconfirmed:known?withLaterOutcome.outcomes.unconfirmed:null};
}
export function businessDaily(accounts: BusinessAccount[], events: AnalyticsEvent[], window: BusinessWindow, internal = new Set<string>(), visitors = new Set<string>(), feature?: string, turns: BusinessTurn[] = []) {
    const eligible = accounts.filter(a => !internal.has(a.id.toLowerCase())), all = events.filter(e => !isExcludedEvent(e, internal, visitors)), kept = all.filter(e => inBusinessWindow(e.created_at, window));
    const rows = [];
    for (let time = epoch(window.start); analyticsDay(time) <= window.to; time += DAY) {
        const day = analyticsDay(time), dayEvents = kept.filter(e => analyticsDay(e.created_at) === day), chat = turns.filter(t => inBusinessWindow(t.createdAt, window) && analyticsDay(t.createdAt) === day && !internal.has(t.userId.toLowerCase())), activity = dayEvents.filter(isActivityEvent);
        const users = new Set([...activity.map(e => e.user_id?.toLowerCase()).filter(Boolean), ...chat.map(t => t.userId.toLowerCase())] as string[]), metrics = countMessages(chat), senders = new Set(chat.filter(t => t.role === "user").map(t => t.userId.toLowerCase()));
        let seconds = 0, timed = 0;
        for (const id of users) {
            const use = observedUseSeconds(all.filter(e => e.user_id?.toLowerCase() === id && isActivityEvent(e)), day);
            seconds += use.seconds;
            if (use.points >= 2)
                timed++;
        }
        const views = dayEvents.filter(e => e.event_name === "page_viewed"), cohort = eligible.filter(a => a.createdAt && analyticsDay(a.createdAt) === day), next = new Date(time + DAY).toISOString(), mature = epoch(next) + DAY <= epoch(window.asOf);
        const returned = cohort.filter(a => all.some(e => e.user_id?.toLowerCase() === a.id.toLowerCase() && isActivityEvent(e) && analyticsDay(e.created_at) === analyticsDay(next))).length;
        const failures = new Set(dayEvents.filter(e => e.event_name === "coach_response_failed").map(e => `${e.user_id}:${(e as BusinessEvent).request_id || e.id}`));
        const resumeMetrics=businessResumeMetrics(all,dayEvents,day,epoch(window.asOf));
        rows.push({ ...resumeMetrics, day, registered: cohort.length, activeUsers: users.size, featureUsers: feature ? new Set(dayEvents.filter(e => featureMatches(e.event_name, feature)).map(e => e.user_id).filter(Boolean)).size : null, senders: senders.size, replies: metrics.replies, sent: metrics.sent, completedRounds: metrics.completed, failedReplies: failures.size, averageMessages: senders.size ? metrics.sent / senders.size : null, averageUseSeconds: users.size ? seconds / users.size : null, timedUserShare: users.size ? timed / users.size : null, durationVersion: BUSINESS_DURATION_VERSION, pv: views.length, uv: new Set(views.map(e => e.user_id || e.event_identity || e.anon_id).filter(Boolean)).size, d1: mature && cohort.length ? returned / cohort.length : null, d1Eligible: mature ? cohort.length : 0, d1Returned: mature ? returned : null });
    }
    return { rows, coverage: { excludedEvents: events.filter(e => inBusinessWindow(e.created_at, window) && isExcludedEvent(e, internal, visitors)).length } };
}
export function groupSessions(turns: BusinessTurn[], window: BusinessWindow, full = false) { const sessions = new Map<string, BusinessTurn[]>(), unlinked: BusinessTurn[] = []; for (const t of uniqueTurns(full ? turns : turns.filter(t => inBusinessWindow(t.createdAt, window)))) {
    if (!t.sessionId)
        unlinked.push(t);
    else
        sessions.set(t.sessionId, [...(sessions.get(t.sessionId) || []), t]);
} return { sessions: [...sessions].map(([id, rows]) => ({ id, turns: rows, linked: true })), unlinked: unlinked.length ? { id: null, label: "未关联会话／旧记录", turns: unlinked, linked: false } : null }; }
export function paymentStatus(fact: {
    creditedTransfer: boolean;
    positiveBalance: boolean;
    confirmedPayment: boolean | null;
}) { return { states: [...(fact.confirmedPayment === true ? ["confirmed_payment"] : []), ...(fact.creditedTransfer ? ["points_redeemed"] : []), ...(fact.positiveBalance ? ["positive_balance"] : []), ...(fact.confirmedPayment === null ? ["unknown"] : [])], paidFilterEnabled: false, paidFilterReason: "暂无可靠付款凭证；不把积分兑换或余额当作人民币付款。" }; }
export const sameOwner = (requested: string, actual: string) => requested.toLowerCase() === actual.toLowerCase();
