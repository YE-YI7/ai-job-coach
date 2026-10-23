import "server-only";
import { createHash } from "node:crypto";
import { analyticsInternalIds, analyticsVisitorIds, isExcludedEvent, analyticsDay } from "./admin-analytics";
import { redactEval } from "./coach-harness/eval-scope";
import { readAnalyticsDetail, type readAnalyticsRows } from "./admin-analytics-store";
import { businessDaily, businessUsers, businessWindow, countMessages, DAY, epoch, eventLabel, groupSessions, inBusinessWindow, paginate, paymentStatus,isBusinessActivityEvent as isActivityEvent, type BusinessAccount, type BusinessTurn, type BusinessFilters, type BusinessEvent } from "./admin-analytics-business";
type Db = Parameters<typeof readAnalyticsRows>[0];
// Heterogeneous DB JSON never crosses the response boundary without allowlisting.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function policy() { const users = analyticsInternalIds(process.env.ANALYTICS_INTERNAL_USER_IDS); if (process.env.VERCEL_ENV === "production" && !users.size)
    throw Error("analytics_exclusions_missing"); return { users, visitors: analyticsVisitorIds(process.env.ANALYTICS_INTERNAL_ANON_IDS) }; }
export function analyticsSafeText(value: unknown, max = 60000) { return typeof value === "string" ? String(redactEval(value.slice(0, max))).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[邮箱已遮蔽]").replace(/(?:\+?86[- ]?)?1[3-9]\d{9}/g, "[手机号已遮蔽]") : ""; }
/** Stable bounded reads, including one overflow row; never publish truncated totals. */
async function rows(db: Db, table: string, fields: string, options: {
    end: string;
    start?: string;
    owner?: string;
    clock?: string;
    cap?: number;
    exclude?: Set<string>;
}) {
    const result: Row[] = [], cap = options.cap || 10000, clock = options.clock || "created_at";
    const excluded = [...(options.exclude || [])].filter(id => UUID.test(id));
    for (let offset = 0; offset <= cap; offset += 500) {
        let q = db.from(table).select(fields).lt(clock, options.end).order(clock).order("id").range(offset, Math.min(offset + 499, cap));
        if (options.owner)
            q = q.eq("user_id", options.owner);
        if (options.start)
            q = q.gte(clock, options.start);
        if (excluded.length)
            q = q.not("user_id", "in", `(${excluded.join(",")})`);
        const { data, error } = await q;
        if (error)
            throw error;
        result.push(...(data || []) as Row[]);
        if (result.length > cap || Buffer.byteLength(JSON.stringify(result)) > 12000000)
            throw Error("analytics_capacity");
        if (!data || data.length < 500)
            break;
    }
    return result;
}
const EVENT_FIELDS = "id,user_id,anon_id,event_identity,event_name,created_at,environment:properties->>environment,qa:properties->>qa,is_test:properties->>is_test,account_cohort:properties->>account_cohort,schema_version:properties->>schema_version,source:properties->>source,session_source:properties->>session_source,first_source:properties->>first_source,request_id:properties->>request_id,generation_id:properties->>generation_id,delivery_outcome:properties->>outcome,persistence:properties->>persistence,reason_code:properties->>reason_code,delivery_stage:properties->>stage,task_id:properties->>task_id,trace_id:properties->>trace_id,eval_run_id:properties->>eval_run_id,opportunity_id:properties->>opportunity_id,change_ids:properties->>change_ids";
const TURN_FIELDS = "id,user_id,question,answer,session_id,request_id,opportunity_id,created_at,observation:learning_trace->stateObservation,suggestion:learning_trace->stageSuggestion";
const TASK_FIELDS = "id,user_id,opportunity_id,state,question,answers,conversation,result,error,version,source_revision,updated_at";
function normalizeTurns(saved: Row[], tasks: Row[], legacy: Row[]): BusinessTurn[] {
    const result: BusinessTurn[] = [];
    for (const row of saved) {
        const base = { userId: String(row.user_id).toLowerCase(), sessionId: row.session_id || null, requestId: row.request_id || row.id, opportunityId: row.opportunity_id || null, createdAt: row.created_at };
        if (row.question)
            result.push({ ...base, id: `${row.id}:user`, role: "user", status: "sent", text: analyticsSafeText(row.question), truncated: String(row.question).length > 60000 });
        if (row.answer)
            result.push({ ...base, id: `${row.id}:mentor`, role: "mentor", status: "replied", text: analyticsSafeText(row.answer), truncated: String(row.answer).length > 60000 });
    }
    for (const task of tasks) {
        const base = { userId: String(task.user_id).toLowerCase(), taskId: task.id, opportunityId: task.opportunity_id, sessionId: `resume:${task.id}` };
        for (const t of Array.isArray(task.conversation) ? task.conversation : []) {
            if (!t || !t.id || !Number.isFinite(epoch(t.savedAt)))
                continue;
            const common = { ...base, requestId: t.id, createdAt: t.savedAt };
            if (t.message)
                result.push({ ...common, id: `${task.id}:${t.id}:user`, role: "user", status: t.status === "failed" ? "failed" : "sent", text: analyticsSafeText(t.message), truncated: String(t.message).length > 60000 });
            if (t.reply)
                result.push({ ...common, id: `${task.id}:${t.id}:mentor`, role: "mentor", status: t.status === "completed" ? "replied" : "unknown", text: analyticsSafeText(t.reply), truncated: String(t.reply).length > 60000 });
        }
        for (const [i, a] of (Array.isArray(task.answers) ? task.answers : []).entries()) {
            if (!a?.answer || !Number.isFinite(epoch(a.savedAt)) || String(a.id || "").startsWith("conversation:") || a.kind === "instruction")
                continue;
            result.push({ ...base, id: `${task.id}:answer:${i}`, requestId: `answer:${i}`, role: "user", status: "sent", createdAt: a.savedAt, text: analyticsSafeText(`针对补问：${a.question || "未留存问题"}\n\n${a.answer}`) });
        }
    }
    for (const row of legacy) {
        if (!["user", "assistant"].includes(row.role))
            continue;
        result.push({ id: `legacy:${row.id}`, userId: String(row.user_id).toLowerCase(), sessionId: row.session_id ? `legacy:${row.session_id}` : null, requestId: null, createdAt: row.created_at, role: row.role === "user" ? "user" : "mentor", status: row.role === "user" ? "sent" : "replied", text: analyticsSafeText(row.content), stage: row.stage, truncated: String(row.content || "").length > 60000,metricEligible:!saved.some(t=>t.user_id===row.user_id&&t.session_id&&t.session_id===row.session_id) });
    }
    return result;
}
const taskSummary = (t: Row) => ({ id: t.id, opportunityId: t.opportunity_id, state: t.state, updatedAt: t.updated_at, question: analyticsSafeText(t.question?.question, 2000), error: analyticsSafeText(t.error, 2000), generationId: typeof t.result?.resumeGenerationId === "string" ? t.result.resumeGenerationId : null, summary: analyticsSafeText(t.result?.summary, 4000), proposedChanges: Array.isArray(t.result?.changes) ? t.result.changes.length : null, changeIds: (Array.isArray(t.result?.changes) ? t.result.changes : []).map((c: Row) => String(c.id)).slice(0, 200), delivery: "unknown", note: "任务状态不等于已交付；历史缺少最终保存／PDF记录时保持未知。" });
export async function readBusinessDataset(db: Db, from: string, to: string, feature?: string, offset = 0, options: BusinessFilters & {
    asOf?: string;
} = {}) {
    const access = policy(), window = businessWindow(from, to, new Date(), options.asOf);
    const end = new Date(Math.min(epoch(window.asOf), epoch(window.end) + DAY)).toISOString();
    const [users, events] = await Promise.all([rows(db, "users", "id,provider,created_at", { end: window.end }), rows(db, "product_events", EVENT_FIELDS, { start: new Date(epoch(window.start) - 1800000).toISOString(), end, cap: 20000 })]);
    // Known QA markers exclude that account before fetching any private body.
    const excluded = new Set(access.users);
    for (const e of events)
        if (e.user_id && (e.account_cohort==="internal"||[true,"true","1"].includes(e.qa)||[true,"true","1"].includes(e.is_test)||/^growth-qa(?:-|$)/.test(String(e.source||""))))
            excluded.add(String(e.user_id).toLowerCase());
    for (const u of users)
        if (/^(qa|test|internal)$/.test(String(u.provider)))
            excluded.add(String(u.id).toLowerCase());
    const [saved, tasks, legacy, jobs, tracking] = await Promise.all([
        rows(db, "coach_agent_turns", TURN_FIELDS, { start: window.start, end: window.end, exclude: excluded }),
        rows(db, "coach_resume_tasks", TASK_FIELDS, { end: new Date().toISOString(), clock: "updated_at", exclude: excluded, cap: 2000 }),
        rows(db, "conversation_messages", "id,user_id,session_id,role,content,stage,created_at", { start: window.start, end: window.end, exclude: excluded }),
        rows(db, "coach_opportunities", "id,user_id,stage", { end: window.asOf, exclude: excluded }),
        db.from("product_events").select("created_at").eq("event_name", "page_viewed").eq("properties->>environment", "production").order("created_at").limit(1).maybeSingle(),
    ]);
    if (tracking.error)
        throw tracking.error;
    const accounts: BusinessAccount[] = users.map(u => ({ id: String(u.id).toLowerCase(), createdAt: u.created_at, provider: u.provider }));
    const known=new Set(accounts.filter(a=>!excluded.has(a.id)).map(a=>a.id));
    const knownEvents=events.filter(e=>!e.user_id||known.has(String(e.user_id).toLowerCase()));
    const chat = normalizeTurns(saved, tasks, legacy).filter(t => known.has(t.userId));
    const userRows = businessUsers(accounts, knownEvents as BusinessEvent[], window, excluded, access.visitors, { ...options, feature }, chat, jobs.map(j => ({ id: j.id, userId: j.user_id, stage: j.stage })));
    const ids = new Set(userRows.map(u => u.id));
    const restricted = Boolean(feature || options.userId || options.cohort || options.stage || options.source || options.minRounds || options.maxRounds !== undefined || options.scope);
    const selectedEvents = knownEvents.filter(e => !restricted || e.user_id && ids.has(String(e.user_id).toLowerCase()));
    const selectedAccounts = restricted ? accounts.filter(a => ids.has(a.id)) : accounts;
    const selectedChat = restricted ? chat.filter(t => ids.has(t.userId)) : chat;
    const daily = businessDaily(selectedAccounts, selectedEvents as BusinessEvent[], window, excluded, access.visitors, feature, selectedChat);
    const eventRows = (selectedEvents as BusinessEvent[]).filter(e => inBusinessWindow(e.created_at, window) && !isExcludedEvent(e, excluded, access.visitors));
    const breakdown = Object.entries(Object.groupBy(eventRows, e => e.event_name)).map(([name, es]) => ({ name, label: eventLabel(name), count: es!.length, users: new Set(es!.map(e => e.user_id).filter(Boolean)).size }));
    const dailyRows=daily.rows.map(row=>({...row,pv:tracking.data?.created_at&&row.day>=analyticsDay(tracking.data.created_at)?row.pv:null,uv:tracking.data?.created_at&&row.day>=analyticsDay(tracking.data.created_at)?row.uv:null}));
    return { window, ...daily,rows:dailyRows, users: paginate(userRows, offset), features: breakdown, ...paymentStatus({ creditedTransfer: false, positiveBalance: false, confirmedPayment: null }), coverage: { ...daily.coverage,orphanEvents:events.length-knownEvents.length, trackingStartedAt: tracking.data?.created_at || null, filtered: restricted, messageBasis: "已保存的用户消息／导师回复；失败事件另列，不补造未保存正文；旧记录无request时无法配对完成轮。", limits: "最多20000事件、10000条对话／账号、2000简历任务；超限拒绝，不报截断总数。", stageBasis: "当前已保存的岗位阶段，非历史阶段快照。" } };
}
async function owner(db: Db, userId: string) {
    const access = policy();
    if (access.users.has(userId.toLowerCase()))
        return null;
    const q = await db.from("users").select("id,provider,created_at").eq("id", userId).maybeSingle();
    if (q.error)
        throw q.error;
    if (!q.data || /^(qa|test|internal)$/.test(String(q.data.provider)))
        return null;
    const mark = await db.from("product_events").select("id").eq("user_id", userId).or("properties->>qa.eq.true,properties->>is_test.eq.true,properties->>account_cohort.eq.internal").limit(1);
    if (mark.error)
        throw mark.error;
    if (mark.data?.length)
        return null;
    return q.data;
}
export async function readBusinessSessions(db: Db, userId: string, from: string, to: string, options: {
    asOf?: string;
    session?: string;
    full?: boolean;
    offset?: number;
    sessionOffset?: number;
    eventOffset?: number;
} = {}) {
    const user = await owner(db, userId);
    if (!user)
        return null;
    const window = businessWindow(from, to, new Date(), options.asOf);
    const [saved, tasks, legacy, jobs, events, runs] = await Promise.all([
        rows(db, "coach_agent_turns", TURN_FIELDS, { owner: userId, end: window.asOf }),
        rows(db, "coach_resume_tasks", TASK_FIELDS, { owner: userId, end: new Date().toISOString(), clock: "updated_at", cap: 2000 }),
        rows(db, "conversation_messages", "id,user_id,session_id,role,content,stage,created_at", { owner: userId, end: window.asOf }),
        rows(db, "coach_opportunities", "id,user_id,company,role,stage,created_at,updated_at", { owner: userId, end: window.asOf }),
        rows(db, "product_events", "id,user_id,event_name,created_at,properties", { owner: userId, end: window.asOf, cap: 20000 }),
        rows(db, "coach_eval_runs", "id,user_id,legacy_trace_id,created_at,label,status", { owner: userId, end: window.asOf }),
    ]);
    const same = (r: Row) => String(r.user_id).toLowerCase() === userId.toLowerCase();
    const ownedTasks = tasks.filter(same), ownedJobs = jobs.filter(same), chat = normalizeTurns(saved.filter(same), ownedTasks, legacy.filter(same));
    const grouped = groupSessions(chat, window, Boolean(options.full && options.session));
    const groups = [...grouped.sessions, ...(grouped.unlinked ? [{ id: "unlinked", turns: grouped.unlinked.turns, linked: false }] : [])].sort((a, b) => epoch(b.turns.at(-1)?.createdAt || "") - epoch(a.turns.at(-1)?.createdAt || ""));
    // full lookup cannot invent a session or attach someone else's ID.
    const selected = options.session ? groups.find(g => g.id === options.session) : null;
    if (options.session && !selected)
        return null;
    const taskHashes = new Map<string, {
        taskId: string;
        generationId: string;
    }>();
    for (const task of ownedTasks)
        for (let v = 1; v <= Math.min(Number(task.version) || 0, 512); v++) {
            const generationId = `${task.id}:${v}`;
            taskHashes.set(createHash("sha256").update(`resume-task:${generationId}`).digest("hex"), { taskId: task.id, generationId });
        }
    const links = events.filter(same).filter(e => e.event_name === "resume_agent_trace" && inBusinessWindow(e.created_at, window)).map(e => {
        const p = e.properties || {}, matched = taskHashes.get(p.requestHash), run = runs.find(r => same(r) && r.legacy_trace_id === p.traceId);
        if (!UUID.test(String(p.traceId)))
            return null;
        const task = matched ? ownedTasks.find(t => t.id === matched.taskId) : null;
        const current = task?.result?.resumeGenerationId === matched?.generationId;
        return { traceId: p.traceId, runId: run?.id || null, createdAt: e.created_at, taskId: matched?.taskId || null, generationId: matched?.generationId || null, outcome: analyticsSafeText(p.outcome, 80), href: `/admin/evals?run=${run?.id || p.traceId}`, changeIds: current ? (Array.isArray(task?.result?.changes) ? task!.result.changes : []).map((c: Row) => String(c.id)).slice(0, 200) : [], io: run ? "已捕获内容以Eval原记录为准" : "只有历史Trace；未捕获的Agent I/O不补造" };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
    const timeline = events.filter(same).filter(e => inBusinessWindow(e.created_at, window) && !isExcludedEvent({ ...e, ...e.properties } as BusinessEvent, policy().users, policy().visitors)).map(e => ({ id: e.id, name: e.event_name, label: eventLabel(e.event_name), createdAt: e.created_at, outcome: analyticsSafeText(e.properties?.outcome, 80), reason: analyticsSafeText(e.properties?.reason_code, 120), stage: analyticsSafeText(e.properties?.stage, 120), generationId: analyticsSafeText(e.properties?.generation_id, 120), changeId: analyticsSafeText(e.properties?.change_id, 120) })).sort((a, b) => epoch(b.createdAt) - epoch(a.createdAt));
    const stages = saved.filter(same).filter(t => inBusinessWindow(t.created_at, window) && (t.observation || t.suggestion)).map(t => ({ id: t.id, createdAt: t.created_at, sessionId: t.session_id, observation: analyticsSafeText(JSON.stringify(t.observation || null), 6000), suggestion: analyticsSafeText(JSON.stringify(t.suggestion || null), 6000) }));
    const visible = chat.filter(t => inBusinessWindow(t.createdAt, window)), metrics = countMessages(visible);
    const history=[...new Set([...events.filter(same).filter(e=>isActivityEvent(e as BusinessEvent)).map(e=>e.created_at),...chat.map(t=>t.createdAt)])].sort((a,b)=>epoch(a)-epoch(b));
    const visits=history.filter((time,i)=>i===0||epoch(time)-epoch(history[i-1])>1800000);
    const observations=events.filter(same).filter(e=>inBusinessWindow(e.created_at,window)&&Number(e.properties?.schema_version)===2);
    const generations=(name:string)=>new Set(observations.filter(e=>e.event_name===name&&e.properties?.generation_id).map(e=>e.properties.generation_id)).size;
    const delivery={attempts:observations.length?generations("resume_task_started"):null,confirmedDocuments:observations.length?generations("resume_document_persisted"):null,delivered:observations.length?new Set(observations.filter(e=>e.event_name==="resume_task_outcome"&&["delivered","partial_delivered"].includes(e.properties?.outcome)&&e.properties?.persistence==="confirmed").map(e=>e.properties.generation_id)).size:null,pdf:"未采集实际文件证据，不以打印请求／afterprint作为成功"};
    let budget = 250000;
    const turnPage = paginate(selected?.turns || [], options.offset || 0);
    turnPage.rows = turnPage.rows.map(t => { const limit = Math.min(60000, budget), text = analyticsSafeText(t.text, limit); budget -= text.length; return { ...t, text, truncated: t.truncated || t.text.length > limit }; });
    const sessionPage = paginate(groups.map(g => ({ id: g.id, title: g.id.startsWith("resume:") ? "简历辅导" : g.id.startsWith("legacy:") ? "历史对话" : g.id === "unlinked" ? "未关联会话／旧记录" : "导师对话", messages: g.turns.length, ...countMessages(g.turns), lastAt: g.turns.at(-1)?.createdAt, opportunityIds: [...new Set(g.turns.map(t => t.opportunityId).filter(Boolean))] })), options.sessionOffset || 0, 10);
    return { window, user: { id: user.id, registeredAt: user.created_at, provider: user.provider }, metrics,delivery,lastObservedAt:history.at(-1)||null,previousVisitAt:visits.at(-2)||null, lastUseAt: chat.map(t => t.createdAt).sort((a, b) => epoch(b) - epoch(a))[0] || null, sessionPage, selectedSession: selected ? { id: selected.id, turns: turnPage, full: Boolean(options.full) } : null, tasks: ownedTasks.map(taskSummary), opportunities: ownedJobs.map(j => ({ id: j.id, company: analyticsSafeText(j.company, 250), role: analyticsSafeText(j.role, 250), stage: j.stage, updatedAt: j.updated_at })), stages, traces: links, events: paginate(timeline, options.eventOffset || 0), coverage: { truncated: false, legacyPairing: "无稳定request的历史消息仅计消息数，不推断完成轮。", currentTasks: "任务和岗位列表是当前保存状态；对话与行为按消息时间筛选。asOf固定查询截止，非可变简历任务的历史事务快照。", allTurns: chat.length } };
}
/** Only allowlisted material, after both account exclusion and explicit ownership. */
export async function readBusinessMaterial(db: Db, userId: string, opportunityId: string) {
    if (!await owner(db, userId))
        return null;
    const detail = await readAnalyticsDetail(db, userId, "material", 0, opportunityId);
    const row = detail?.rows[0];
    if (!row)
        return null;
    const job = await db.from("coach_opportunities").select("id,user_id,quality:metadata->applicationQuality,changes:metadata->resumeChanges,practices:metadata->interviewPractices,mocks:metadata->mockInterviews,reviews:metadata->reviewReports,snapshots:metadata->snapshots").eq("id", opportunityId).eq("user_id", userId).maybeSingle();
    if (job.error)
        throw job.error;
    if (!job.data || String(job.data.user_id).toLowerCase() !== userId.toLowerCase())
        return null;
    const material = job.data as Row;
    const allowed = new Set(["id", "before", "after", "section", "reason", "status", "reviewerType", "summary", "reviews", "findings", "message", "severity", "changeId", "round", "grade", "overallComment", "strengths", "improvements", "actions", "sourceNotes", "createdAt", "question", "answer", "verdict", "gaps", "followUp", "improvedOutline", "turns", "questionId", "assessment", "score", "dimensions", "name", "comment", "overallScore", "weaknesses", "suggestions", "currentIndex", "snapshotType", "version", "title", "frozenAt"]);
    let budget = Math.max(0,300000-JSON.stringify(row).length), truncated = false;
    const clean = (v: unknown, depth = 0): unknown => { if (depth > 9) {
        truncated = true;
        return "[嵌套内容已截断]";
    } if (typeof v === "string") {
        const limit = Math.min(60000, budget);
        if (v.length > limit)
            truncated = true;
        const s = analyticsSafeText(v, limit);
        budget -= s.length;
        return s;
    } if (Array.isArray(v)) {
        if (v.length > 200)
            truncated = true;
        return v.slice(0, 200).map(x => clean(x, depth + 1));
    } if (v && typeof v === "object")
        return Object.fromEntries(Object.entries(v).filter(([k]) => allowed.has(k)).map(([k, x]) => [k, clean(x, depth + 1)])); return typeof v === "number" || typeof v === "boolean" || v === null ? v : null; };
    return { material: row, quality: clean(material.quality), changes: clean(material.changes || []), practices: clean(material.practices || []), mocks: clean(material.mocks || []), reviews: clean(material.reviews || []), snapshots: clean(material.snapshots || []), truncated: truncated || detail.truncated, note: "当前保存的材料；不是所选日期的历史快照。快照仅展示实际留存的版本元信息，不还原未保存正文。" };
}
