"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import TutorMarkdown from "@/components/cockpit/TutorMarkdown";
import { FEATURES, STAGES, type BusinessTurn } from "@/lib/admin-analytics-business";
import { ACQUISITION_LABELS } from "@/lib/acquisition";
import type { readBusinessDataset, readBusinessMaterial, readBusinessSessions } from "@/lib/admin-analytics-business-store";
import styles from "./BusinessWorkspace.module.css";
type Dataset = Awaited<ReturnType<typeof readBusinessDataset>>;
type Sessions = NonNullable<Awaited<ReturnType<typeof readBusinessSessions>>>;
type Material = NonNullable<Awaited<ReturnType<typeof readBusinessMaterial>>>;
type Payload = {
    dataset?: Dataset;
    sessions?: Sessions;
    material?: Material;
};
const views = { daily: "基础数据", sessions: "会话下钻", users: "按用户", geo: "GEO 研究" };
const metricNames: Record<string, string> = { resumeAttempts: "改稿尝试", resumeDelivered: "完整交付", resumePartial: "部分交付", resumeFailed: "改稿失败", resumeBlocked: "质检／保存受阻", resumeUnconfirmed: "结果未确认", registered: "注册", activeUsers: "活跃用户", featureUsers: "功能使用人数", sent: "用户消息", replies: "导师回复", completedRounds: "完成轮", averageMessages: "人均消息", averageUseSeconds: "估算秒数", timedUserShare: "估时覆盖", failedReplies: "回复失败事件", pv: "PV", uv: "UV", d1: "成熟次留" };
const defaultColumns = ["registered", "activeUsers", "sent", "completedRounds", "averageMessages", "averageUseSeconds", "failedReplies"];
const tabs = { conversation: "对话", resume: "简历", jd: "JD／岗位", interview: "面试", stage: "阶段判断", events: "行为／断点", trace: "Eval／Trace" };
const keys = ["view", "from", "to", "feature", "cohort", "scope", "stage", "source", "sort", "search", "minRounds", "maxRounds", "offset", "user", "session", "messageOffset", "sessionOffset", "eventOffset", "full", "tab", "opportunity", "asOf", "columns"];
function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function readSearch() { return typeof window === "undefined" ? "" : window.location.search; }
function canonical(params: URLSearchParams) { const clean = new URLSearchParams(); for (const key of keys) {
    const value = params.get(key);
    if (value)
        clean.set(key, value);
} clean.sort(); return clean.toString(); }
function write(params: URLSearchParams, replace = false) { window.history[replace ? "replaceState" : "pushState"](null, "", `?${canonical(params)}`); window.dispatchEvent(new PopStateEvent("popstate")); }
function at(value: unknown) { return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : "未记录"; }
function number(value: unknown, ratio = false) { return typeof value === "number" && Number.isFinite(value) ? ratio ? `${(value * 100).toFixed(1)}%` : Number.isInteger(value) ? String(value) : value.toFixed(1) : "—"; }
function parsed(value: string): unknown { try {
    return JSON.parse(value);
}
catch {
    return value;
} }
const jsonLabels: Record<string, string> = { before: "原文", after: "修改", reason: "原因", section: "区块", status: "状态", reviewerType: "检查来源", summary: "总结", findings: "发现的问题", message: "说明", severity: "严重程度", changeId: "修改 ID", id: "记录 ID", round: "轮次", grade: "留存结论", overallComment: "总体反馈", strengths: "优势", improvements: "待改进", actions: "后续动作", sourceNotes: "原始面试记录", createdAt: "记录时间", question: "问题", answer: "回答", verdict: "判断", gaps: "信息缺口", followUp: "追问", improvedOutline: "改进提纲", turns: "对话", assessment: "留存评估", score: "留存分数", dimensions: "维度", name: "名称", comment: "意见", overallScore: "留存总分", weaknesses: "待补足", suggestions: "建议", snapshotType: "快照类型", version: "版本", title: "标题", frozenAt: "冻结时间" };
function Facts({ value }: {
    value: unknown;
}): ReactNode { if (value === null || value === undefined)
    return <p className={styles.muted}>未留存</p>; if (typeof value === "string")
    return <TutorMarkdown>{value}</TutorMarkdown>; if (typeof value === "number" || typeof value === "boolean")
    return <span>{String(value)}</span>; if (Array.isArray(value))
    return value.length ? <div className={styles.records}>{value.map((v, i) => <div className={styles.record} key={i}><Facts value={v}/></div>)}</div> : <p className={styles.muted}>没有留存记录</p>; return <dl className={styles.facts}>{Object.entries(value as Record<string, unknown>).map(([key, v]) => <div key={key}><dt>{jsonLabels[key] || key}</dt><dd><Facts value={v}/></dd></div>)}</dl>; }
function Pager({ offset, total, next, onPage, label }: {
    offset: number;
    total: number;
    next: number | null;
    onPage: (n: number) => void;
    label: string;
}) { return <nav className={styles.pager} aria-label={label}><span>共 {total} 条 · 当前 {total ? offset + 1 : 0}–{Math.min(next === null ? total : next, total)}</span><button disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - 20))}>上一页</button><button disabled={next === null} onClick={() => next !== null && onPage(next)}>下一页</button></nav>; }
function CompanionTrace({ userId, item }: { userId: string; item: Sessions["companionTraces"][number] }) {
    const [trace, setTrace] = useState<Record<string, unknown> | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
    async function load() {
        if (busy) return;
        setBusy(true); setError("");
        try {
            const response = await fetch(`/api/admin/companion-traces?userId=${encodeURIComponent(userId)}&requestId=${encodeURIComponent(item.requestId)}`, { cache: "no-store" });
            const body = await response.json();
            if (!response.ok || !body.trace) throw Error(body.error || "这条记录暂未读回");
            setTrace(body.trace);
        } catch (e) { setError(e instanceof Error ? e.message : "读取失败，可重试"); }
        finally { setBusy(false); }
    }
    return <article className={styles.record}>
        <p>{at(item.createdAt)} · {item.submissionId ? "提交反馈" : "目标与安排"}</p>
        <p className={styles.id}>导师请求 {item.requestId}<br />计划 {item.planId} · 版本 {item.version ?? "未留存"}<br />提交 {item.submissionId || "首次安排"}</p>
        {!trace && <button type="button" disabled={busy} onClick={() => void load()}>{busy ? "正在读取…" : "查看本次完整处理记录"}</button>}
        {error && <p role="alert">{error}</p>}
        {trace && <>
            <details open><summary>输入与最终回复</summary><Facts value={{ question: trace.input, answer: trace.output }}/></details>
            <details><summary>模型实际输入输出与知识</summary><Facts value={{ system: trace.system, prompt: trace.prompt, modelOutput: trace.modelOutput, knowledge: trace.knowledge, materials: trace.materials }}/></details>
            <details><summary>检查、保存关联与当前安排</summary><Facts value={{ binding: trace.binding, guards: trace.guards, currentPlan: trace.currentPlan }}/></details>
            <details><summary>模型用量与耗时</summary><Facts value={{ model: trace.model, usage: trace.usage, timing: trace.timing }}/></details>
            <p className={styles.muted}>{String(trace.evidenceBoundary)}</p>
        </>}
    </article>;
}
export default function BusinessWorkspace() {
    const search = useSyncExternalStore(callback => { window.addEventListener("popstate", callback); return () => window.removeEventListener("popstate", callback); }, readSearch, () => "");
    const params = new URLSearchParams(search), view = (Object.hasOwn(views, params.get("view") || "") ? params.get("view") : "daily") as keyof typeof views;
    const from = params.get("from") || today(), to = params.get("to") || today(), user = params.get("user") || "", tab = (Object.hasOwn(tabs, params.get("tab") || "") ? params.get("tab") : "conversation") as keyof typeof tabs;
    const normalized = new URLSearchParams(canonical(params));
    normalized.set("view", view);
    normalized.set("from", from);
    normalized.set("to", to);
    const dataParams = new URLSearchParams(normalized);
    dataParams.delete("columns");
    dataParams.delete("tab");
    const requestKey = canonical(dataParams), [state, setState] = useState<{
        key: string;
        payload: Payload | null;
        error: string;
    }>({ key: "", payload: null, error: "" }), [retry, setRetry] = useState(0);
    const materialMode = Boolean(user && params.get("opportunity") && ["resume", "jd", "interview"].includes(tab));
    // The material is a separate read; switching tabs never changes the user's source.
    const materialKey = materialMode ? `${user}:${params.get("opportunity")}:${params.get("asOf") || ""}` : "";
    const [materialState, setMaterial] = useState<{
        key: string;
        data: Material | null;
        error: string;
    }>({ key: "", data: null, error: "" });
    function navigate(patch: Record<string, string | undefined>, replace = false) { const next = new URLSearchParams(window.location.search); for (const [k, v] of Object.entries(patch)) {
        if(v)next.set(k,v);else next.delete(k);
    } write(next, replace); }
    useEffect(() => {
        if (view === "geo" || state.key === requestKey)
            return;
        const controller = new AbortController(), q = new URLSearchParams(requestKey);
        const api = new URLSearchParams({ view: user ? "sessions" : view === "daily" ? "daily" : "users", from, to });
        for (const key of ["feature", "cohort", "scope", "stage", "source", "sort", "search", "minRounds", "maxRounds", "asOf"])
            if (q.get(key))
                api.set(key, q.get(key)!);
        if (user) {
            api.set("userId", user);
            for (const key of ["session", "full", "sessionOffset", "eventOffset"])
                if (q.get(key))
                    api.set(key, q.get(key)!);
            api.set("offset", q.get("messageOffset") || "0");
        }
        else
            api.set("offset", q.get("offset") || "0");
        fetch(`/api/admin/analytics?${api}`, { signal: controller.signal, credentials: "same-origin", cache: "no-store" }).then(async (r) => {
            const body = await r.json();
            if (!r.ok)
                throw Error(body.error || "读取失败");
            if (controller.signal.aborted)
                return;
            const snapshot = body.dataset?.window?.asOf || body.sessions?.window?.asOf;
            let key = requestKey;
            if (snapshot && !q.get("asOf")) {
                q.set("asOf", snapshot);
                key = canonical(q);
                const url = new URLSearchParams(window.location.search);
                url.set("asOf", snapshot);
                url.set("from", from);
                url.set("to", to);
                url.set("view", view);
                setState({ key, payload: body, error: "" });
                write(url, true);
            }
            else
                setState({ key, payload: body, error: "" });
        }).catch((e: Error) => { if (!controller.signal.aborted)
            setState({ key: requestKey, payload: null, error: e.message }); });
        return () => controller.abort();
        // State is only committed by the active async request; query identity hides old content immediately.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestKey, retry]);
    useEffect(() => {
        if (!materialKey)
            return;
        const controller = new AbortController(), q = new URLSearchParams({ view: "material", from, to, userId: user, opportunityId: params.get("opportunity")! });
        if (params.get("asOf"))
            q.set("asOf", params.get("asOf")!);
        fetch(`/api/admin/analytics?${q}`, { signal: controller.signal, cache: "no-store", credentials: "same-origin" }).then(async (r) => { const body = await r.json(); if (!r.ok)
            throw Error(body.error || "材料读取失败"); if (!controller.signal.aborted)
            setMaterial({ key: materialKey, data: body.material, error: "" }); }).catch((e: Error) => { if (!controller.signal.aborted)
            setMaterial({ key: materialKey, data: null, error: e.message }); });
        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [materialKey]);
    const current = state.key === requestKey && view !== "geo", payload = current ? state.payload : null, data = payload?.dataset, detail = payload?.sessions, error = current ? state.error : "", loading = view !== "geo" && !current;
    const cols = (params.get("columns") || defaultColumns.join(",")).split(",").filter(k => Object.hasOwn(metricNames, k));
    const offset = Number(params.get("offset") || 0), messageOffset = Number(params.get("messageOffset") || 0);
    const filterKey=[view,from,to,...["feature","search","cohort","scope","stage","source","sort","minRounds","maxRounds"].map(k=>params.get(k)||"")].join(":");
    function resetSelection() { return { user: undefined, session: undefined, opportunity: undefined, tab: undefined, messageOffset: undefined, sessionOffset: undefined, eventOffset: undefined, full: undefined, offset: undefined, asOf: undefined }; }
    function apply(form: HTMLFormElement) { const f = new FormData(form), next = new URLSearchParams(); next.set("view", view); for (const key of ["from", "to", "cohort", "scope", "stage", "source", "sort", "search", "minRounds", "maxRounds"]) {
        const v = String(f.get(key) || "");
        if (v)
            next.set(key, v);
    } const features = f.getAll("feature").map(String); if (features.length)
        next.set("feature", features.join(",")); if (params.get("columns"))
        next.set("columns", params.get("columns")!); write(next); }
    return <div className={styles.app}><div className={styles.workspace}>
    <aside className={styles.side}><Link href="/admin/evals" className={styles.brand}>益职 Eval</Link><nav aria-label="数据视角">{Object.entries(views).map(([id, label]) => <button type="button" key={id} aria-current={view === id ? "page" : undefined} onClick={() => navigate({ ...resetSelection(), view: id })}>{label}</button>)}</nav><div className={styles.sideFoot}><Link href="/admin/evals">Eval 运行与案例反馈</Link><Link href="/admin/evals/records">开发记录</Link></div></aside>
    <main className={styles.main}><header className={styles.header}><div><h1>{views[view]}</h1><p>{view === "geo" ? "研究与实际引用证据" : `${from} 至 ${to} · 北京时间`}</p></div>{view !== "geo" && <button className={styles.action} onClick={() => navigate({ asOf: undefined, offset: undefined, messageOffset: undefined, sessionOffset: undefined, eventOffset: undefined })} disabled={loading}>刷新数据</button>}</header>
    {view === "geo" ? <section className={styles.empty}><h2>暂不自动运行</h2><p>TokenDance API 与官网搜索、来源选择及引用排序尚无等价证据。这里不调用模型、不定时运行，也不产生费用。</p><p>历史 25 题试点保留在开发记录，不能当作持续引用率。</p><Link href="/admin/evals/records">查看已有研究记录</Link></section> : <>
      <form key={filterKey} className={styles.filters} onSubmit={e => { e.preventDefault(); apply(e.currentTarget); }}>
        <div className={styles.filterRow}><label>开始日期<input name="from" type="date" max={today()} defaultValue={from} required/></label><label>结束日期<input name="to" type="date" max={today()} defaultValue={to} required/></label><label>用户范围<select name="scope" defaultValue={params.get("scope") || ""}><option value="">活跃＋当期新注册</option><option value="active">当期活跃</option><option value="registered">当期注册</option><option value="all">全部已注册</option></select></label><button className={styles.primary} type="submit">应用筛选</button><button type="button" onClick={() => { const day = today(); write(new URLSearchParams({ view, from: day, to: day })); }}>清空筛选</button></div>
        <details className={styles.advanced}><summary>更多筛选{params.get("feature") || params.get("cohort") || params.get("search") ? " · 已设置" : ""}</summary><div className={styles.filterRow}><label>用户 ID<input name="search" placeholder="完整用户 ID" defaultValue={params.get("search") || ""}/></label><label>新／老用户<select name="cohort" defaultValue={params.get("cohort") || ""}><option value="">全部</option><option value="new">新用户</option><option value="old">老用户</option><option value="unknown">未知</option></select></label><label>当前岗位阶段<select name="stage" defaultValue={params.get("stage") || ""}><option value="">全部</option>{Object.entries(STAGES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><label>会话来源<select name="source" defaultValue={params.get("source") || ""}><option value="">全部</option>{Object.entries(ACQUISITION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><label>完成轮最少<input name="minRounds" type="number" min="0" max="100000" defaultValue={params.get("minRounds") || ""}/></label><label>完成轮最多<input name="maxRounds" type="number" min="0" max="100000" defaultValue={params.get("maxRounds") || ""}/></label><label>排序<select name="sort" defaultValue={params.get("sort") || "recent"}><option value="recent">最近使用</option><option value="registered">注册时间</option><option value="rounds">完成轮数</option></select></label><label>已确认付款<select disabled aria-describedby="payment-note"><option>暂无可靠凭证，暂不可筛</option></select></label></div><fieldset className={styles.checks}><legend>使用功能（多选为任一满足）</legend>{Object.entries(FEATURES).map(([value, f]) => <label key={value}><input name="feature" type="checkbox" value={value} defaultChecked={(params.get("feature") || "").split(",").includes(value)}/>{f.label}</label>)}</fieldset><p id="payment-note" className={styles.muted}>积分兑换与余额不等于人民币付款。未记录的阶段、来源或注册方式保持未知。</p></details>
      </form>
      <div className={styles.context}><span>条件：{[params.get("scope") === "all" ? "全部已注册" : params.get("scope") === "active" ? "当期活跃" : params.get("scope") === "registered" ? "当期注册" : "活跃＋当期新注册", params.get("cohort"), params.get("feature"), params.get("stage"), params.get("source"), params.get("search")].filter(Boolean).join(" · ")}</span>{params.get("asOf") && <span>快照截至 {at(params.get("asOf"))}（翻页沿用）</span>}</div>
      {loading && <p role="status" className={styles.empty}>正在读取所选范围…</p>}{error && <div role="alert" className={styles.empty}><p>{error}</p><button onClick={() => { setState({ key: "", payload: null, error: "" }); setRetry(n=>n+1);navigate({ asOf: undefined }); }}>重新读取</button></div>}
      {data && !user && view === "daily" && <><details className={styles.columns}><summary>显示指标 · {cols.length} 项</summary><div className={styles.checks}>{Object.entries(metricNames).map(([k, l]) => <label key={k}><input type="checkbox" checked={cols.includes(k)} onChange={e => navigate({ columns: (e.target.checked ? [...cols, k] : cols.filter(c => c !== k)).join(",") || "registered" }, true)}/>{l}</label>)}</div></details><div className={styles.tableWrap}><table><caption>按天使用情况；消息为已保存记录，失败事件另列。</caption><thead><tr><th>日期</th>{cols.map(k => <th key={k}>{metricNames[k]}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row.day}><td>{row.day}</td>{cols.map(k => <td key={k}>{["registered", "activeUsers", "featureUsers"].includes(k) ? <button onClick={() => navigate({ ...resetSelection(), view: "users", from: row.day, to: row.day, scope: k === "registered" ? "registered" : "active" })}>{number((row as unknown as Record<string, unknown>)[k])}</button> : number((row as unknown as Record<string, unknown>)[k], ["d1", "timedUserShare"].includes(k))}</td>)}</tr>)}</tbody></table></div><details className={styles.definitions}><summary>统计口径与采集覆盖</summary><p>{data.coverage.messageBasis}</p><p>人均消息＝已存用户消息／有发言的账号数。完成轮必须有同 request 的已存问题和回复。估时按相邻事件最多5分钟、超过30分钟断开，跨午夜分摊；单点0是可观察下限。估时覆盖＝至少两行为点的活跃用户比例。</p><p>UV/PV 采集开始：{data.coverage.trackingStartedAt ? at(data.coverage.trackingStartedAt) : "未记录"}；早于采集起点不可解读为真实0。次留只纳入完整经过次日的注册批次，— 表示未成熟或无分母。{data.coverage.stageBasis} {data.coverage.limits}</p></details><section className={styles.section}><h2>功能与事件</h2><div className={styles.tableWrap}><table><thead><tr><th>行为</th><th>事件次数</th><th>使用账号</th></tr></thead><tbody>{data.features.map(f => <tr key={f.name}><td>{f.label}</td><td>{f.count}</td><td><button onClick={() => navigate({ ...resetSelection(), view: "users", feature: f.name })}>{f.users}</button></td></tr>)}</tbody></table></div></section></>}
      {data && !user && view !== "daily" && <><div className={styles.tableWrap}><table><caption>{view === "sessions" ? "选择用户，查看当天会话与材料" : "按用户查看使用情况"} · 共 {data.users.total} 人</caption><thead><tr><th>用户 ID</th><th>属性</th><th>注册方式</th><th>用户／导师消息</th><th>完成轮</th><th>功能</th><th>最近使用</th></tr></thead><tbody>{data.users.rows.map(row => <tr key={row.id}><td><button className={styles.id} onClick={() => navigate({ user: row.id, session: undefined, messageOffset: undefined })}>{row.id}</button></td><td>{row.age === "new" ? "新用户" : row.age === "old" ? "老用户" : "未知"}{row.note && <small>{row.note}</small>}</td><td>{row.provider || "未记录"}</td><td>{row.sent}／{row.replies}</td><td>{row.completed}</td><td>{row.features.map(f => FEATURES[f as keyof typeof FEATURES]?.label).join("、") || "—"}</td><td>{at(row.lastEventAt)}</td></tr>)}</tbody></table>{!data.users.total && <p className={styles.empty}>没有符合当前条件的用户。可清空筛选或选择全部已注册。</p>}</div><Pager offset={offset} total={data.users.total} next={data.users.nextOffset} label="用户分页" onPage={n => navigate({ offset: String(n) })}/></>}
      {detail && user && <section className={styles.detail}><button onClick={() => navigate({ user: undefined, session: undefined, opportunity: undefined, messageOffset: undefined, full: undefined })}>返回用户列表</button><div className={styles.userHead}><h2 className={styles.id}>{detail.user.id}</h2><p>注册 {at(detail.user.registeredAt)} · 方式 {detail.user.provider || "未知"} · 本期 {detail.metrics.sent} 条用户消息／{detail.metrics.replies} 条导师回复／{detail.metrics.completed} 个完成轮</p><p>最近观察使用 {at(detail.lastObservedAt)} · 上一访问段起点 {at(detail.previousVisitAt)}（相隔30分钟估算，非逻辑会话）</p><p>已记录改稿尝试 {number(detail.delivery.attempts)} · 确认交付 {number(detail.delivery.delivered)} · 确认文档保存 {number(detail.delivery.confirmedDocuments)}；— 表示尚未采集该证据。</p><p>{detail.delivery.pdf}。{detail.coverage.currentTasks} 同session旧表内容仍可查看，已有新版turn时不重复并入消息统计。</p></div><nav className={styles.tabs} aria-label="用户详情内容">{Object.entries(tabs).map(([id, label]) => <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => navigate({ tab: id })}>{label}</button>)}</nav>
        {tab === "conversation" && <div className={styles.split}><div className={styles.sessionList}><h3>会话</h3>{detail.sessionPage.rows.map(s => <button key={s.id} aria-current={params.get("session") === s.id ? "page" : undefined} onClick={() => navigate({ session: s.id, messageOffset: undefined, full: undefined })}><strong>{s.title}</strong><span>{at(s.lastAt)} · {s.messages} 条</span></button>)}{!detail.sessionPage.total && <p>所选日期没有留存对话；可到行为页查看失败事件。</p>}<div className={styles.pager}><button disabled={!Number(params.get("sessionOffset"))} onClick={() => navigate({ sessionOffset: String(Math.max(0, Number(params.get("sessionOffset") || 0) - 10)) })}>前10个</button><button disabled={detail.sessionPage.nextOffset === null} onClick={() => navigate({ sessionOffset: String(detail.sessionPage.nextOffset) })}>后10个</button></div></div><section className={styles.chat} aria-label="会话正文">{detail.selectedSession ? <><div className={styles.chatTools}><span>{detail.selectedSession.full ? "完整会话（跨日期）" : "所选日期内的消息"}</span><button onClick={() => navigate({ full: detail.selectedSession!.full ? undefined : "1", messageOffset: undefined })}>{detail.selectedSession.full ? "只看所选日期" : "查看完整会话"}</button></div>{detail.selectedSession.turns.rows.map((t: BusinessTurn) => <article key={t.id} className={t.role === "user" ? styles.userBubble : styles.mentorBubble}><div className={styles.messageMeta}>{t.role === "user" ? "用户" : "导师"} · {at(t.createdAt)} · {t.status === "failed" ? "处理失败" : t.status === "unknown" ? "未确认完成" : "已保存"}</div><TutorMarkdown>{t.text}</TutorMarkdown>{t.truncated && <p className={styles.muted}>这条长消息已截断。</p>}</article>)}<Pager offset={messageOffset} total={detail.selectedSession.turns.total} next={detail.selectedSession.turns.nextOffset} label="消息分页" onPage={n => navigate({ messageOffset: String(n) })}/></> : <p className={styles.empty}>选择左侧会话查看原始消息。</p>}</section></div>}
        {["resume", "jd", "interview"].includes(tab) && <><div className={styles.materialPicker}><label>关联岗位／材料<select value={params.get("opportunity") || ""} onChange={e => navigate({ opportunity: e.target.value })}><option value="">选择一份材料</option>{detail.opportunities.map(j => <option key={j.id} value={j.id}>{j.company} · {j.role}</option>)}</select></label><span>仅显示确属该用户的资料</span></div>{!detail.opportunities.length && <p>没有留存岗位或材料。</p>}{materialMode && (materialState.key !== materialKey ? <p role="status">正在读取材料…</p> : materialState.error ? <p role="alert">{materialState.error}</p> : materialState.data && <div className={styles.material}><p className={styles.muted}>{materialState.data.note}{materialState.data.truncated ? "部分长内容已截断。" : ""}</p>{tab === "resume" ? <><h3>当前原稿</h3><TutorMarkdown>{String((materialState.data.material as {
                sourceResume?: string;
            }).sourceResume || "未留存原稿")}</TutorMarkdown><h3>当前工作稿</h3><TutorMarkdown>{String((materialState.data.material as {
                workingResume?: string;
            }).workingResume || "未留存工作稿")}</TutorMarkdown><details><summary>修改 ID、原文与改后内容</summary><Facts value={materialState.data.changes}/></details><details><summary>留存的质量检查</summary><Facts value={materialState.data.quality}/></details><details><summary>实际快照元信息</summary><Facts value={materialState.data.snapshots}/></details></> : tab === "jd" ? <><h3>当前 JD</h3><TutorMarkdown>{String((materialState.data.material as {
                jd?: string;
            }).jd || "未留存 JD")}</TutorMarkdown></> : <><h3>模拟面试</h3><Facts value={materialState.data.mocks}/><h3>面试练习</h3><Facts value={materialState.data.practices}/><h3>真实面试复盘</h3><Facts value={materialState.data.reviews}/></>}</div>)}{tab === "resume" && <section className={styles.section}><h3>当前改稿任务与交付证据</h3>{detail.tasks.map(t => <div className={styles.record} key={t.id}><p className={styles.id}>{t.id}</p><p>任务状态 {t.state} · 建议数 {t.proposedChanges ?? "未知"} · {at(t.updatedAt)}</p>{t.summary && <TutorMarkdown>{t.summary}</TutorMarkdown>}{t.question && <p>待补一问：{t.question}</p>}{t.error && <p>{t.error}</p>}<p className={styles.muted}>{t.note}</p></div>)}</section>}</>}
        {tab === "stage" && <><h3>当前岗位阶段</h3>{detail.opportunities.map(j => <p key={j.id}>{j.company} · {j.role}：{STAGES[j.stage] || j.stage}（当前）</p>)}<h3>当时留存的导师判断</h3>{!detail.stages.length && <p>所选日期没有留存阶段判断，不根据当前状态倒推。</p>}{detail.stages.map(s => <article className={styles.record} key={s.id}><p>{at(s.createdAt)} · 会话 {s.sessionId || "未关联"}</p><Facts value={parsed(s.observation)}/><Facts value={parsed(s.suggestion)}/></article>)}</>}
        {tab === "events" && <><p className={styles.muted}>这是最后观察到的行为，不推断离开原因。模型／响应成功、建议留存、用户采纳、确认保存及实际 PDF 证据分别看待。</p><div className={styles.tableWrap}><table><thead><tr><th>时间</th><th>行为</th><th>留存结果／失败码</th><th>关联 ID</th></tr></thead><tbody>{detail.events.rows.map(e => <tr key={e.id}><td>{at(e.createdAt)}</td><td>{e.label}</td><td>{e.outcome || e.reason || "未记录"}</td><td className={styles.id}>{e.generationId || e.changeId || "—"}</td></tr>)}</tbody></table></div><Pager offset={Number(params.get("eventOffset") || 0)} total={detail.events.total} next={detail.events.nextOffset} label="行为分页" onPage={n => navigate({ eventOffset: String(n) })}/></>}
        {tab === "trace" && <><h3>求职陪伴处理记录</h3>{detail.companionTraces?.map(item => <CompanionTrace key={item.requestId} userId={detail.user.id} item={item}/>)}{!detail.companionTraces?.length && <p>所选范围未留存陪伴请求。</p>}<h3>简历 Eval／Trace</h3><p className={styles.muted}>按确切任务请求／Trace／运行编号关联；没有捕获的 I/O 保持缺失，不拿最新一条替代。</p>{!detail.traces.length && <p className={styles.empty}>所选日期未捕获 Eval／Trace。</p>}{detail.traces.map(t => <article className={styles.record} key={t.traceId}><p>{at(t.createdAt)} · 留存结果 {t.outcome || "未知"}</p><p className={styles.id}>Trace {t.traceId}<br />运行 {t.runId || "仅历史 Trace"}<br />任务 {t.taskId || "未关联具体任务"}<br />修改 {t.changeIds.join("、") || "未留存该次修改 ID"}</p><p>{t.io}</p><Link href={t.href}>打开这条完整 Eval／Trace</Link></article>)}</>}
      </section>}
    </>}</main></div></div>;
}
