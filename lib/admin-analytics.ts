import { isAcquisitionSource } from "./acquisition";

/** Read-only product metrics. Server receipt time avoids client clock/backfill skew. */
export interface AnalyticsUser {
  id: string;
  provider: string | null;
  created_at: string;
  last_active: string | null;
}
export interface AnalyticsEvent {
  id: string;
  user_id: string | null;
  anon_id?: string | null;
  event_identity: string | null;
  event_name: string;
  created_at: string;
  source?: string | null;
  first_source?: string | null;
  session_source?: string | null;
  attribution_version?: string | number | null;
  page?: string | null;
  host?: string | null;
  environment?: string | null;
  account_cohort?: string | null;
  qa?: string | boolean | null;
  is_test?: string | boolean | null;
  schema_version?: string | number | null;
  delivery_outcome?: string | null;
  generation_id?: string | null;
  persistence?: string | null;
  workflow_version?: string | null;
  delivery_stage?: string | null;
  reason_code?: string | null;
  change_id?: string | null;
  document_revision?: string | null;
  entry_kind?: string | null;
  submission_id?: string | null;
  request_id?: string | null;
}
const DAY = 86400000,
  CHINA_OFFSET = 8 * 3600000;
export const analyticsDay = (time: string | number) =>
  new Date(new Date(time).getTime() + CHINA_OFFSET).toISOString().slice(0, 10);
export function analyticsWindow(days: number, now = new Date()) {
  const end = now.toISOString();
  const today = Date.parse(analyticsDay(end) + "T00:00:00+08:00");
  return {
    start: new Date(today - (days - 1) * DAY).toISOString(),
    end,
    days,
    timezone: "Asia/Shanghai",
  };
}
export function analyticsInternalIds(raw = "") {
  return new Set([...analyticsVisitorIds(raw)].map((id) => id.toLowerCase()));
}
/** Browser IDs are opaque and case-sensitive; account UUIDs are not. */
export function analyticsVisitorIds(raw = "") {
  return new Set(
    raw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );
}
const marked = (x: unknown) => x === true || x === "true" || x === "1";
export function isExcludedEvent(
  e: AnalyticsEvent,
  ids: Set<string>,
  visitors = new Set<string>(),
) {
  return (
    Boolean(e.user_id && ids.has(e.user_id.toLowerCase())) ||
    Boolean(!e.user_id && e.anon_id && visitors.has(e.anon_id)) ||
    Boolean(
      !e.user_id &&
      e.event_identity?.startsWith("anon:") &&
      visitors.has(e.event_identity.slice(5)),
    ) ||
    e.account_cohort === "internal" ||
    marked(e.qa) ||
    marked(e.is_test) ||
    [e.source, e.first_source, e.session_source].some((s) => /^growth-qa(?:-|$)/.test(s || "")) ||
    ["development", "preview"].includes(e.environment || "")
  );
}
const DIAGNOSTIC_EVENTS = new Set([
  "resume_agent_trace",
  "resume_task_started",
  "resume_task_outcome",
  "resume_result_presented",
  "resume_change_decided",
  "resume_document_persisted",
]);
// Server traces and one-generation delivery rows are diagnostics, not a return visit.
export const isActivityEvent = (e: AnalyticsEvent) => !DIAGNOSTIC_EVENTS.has(e.event_name);
export function estimateUsage(events: AnalyticsEvent[]) {
  const sorted = [...events].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  let seconds = 0,
    sessions = 0,
    singleEventSessions = 0,
    eventsInSession = 0,
    previous = 0;
  for (const e of sorted) {
    const time = Date.parse(e.created_at),
      gap = (time - previous) / 1000;
    if (!previous || gap > 1800) {
      if (eventsInSession === 1) singleEventSessions++;
      sessions++;
      eventsInSession = 1;
    } else {
      seconds += Math.min(300, Math.max(0, gap));
      eventsInSession++;
    }
    previous = time;
  }
  if (eventsInSession === 1) singleEventSessions++;
  return {
    seconds,
    sessions,
    singleEventSessions,
    averageSeconds: sessions ? seconds / sessions : null,
  };
}
export const EVENT_LABELS: Record<string, string> = {
  page_viewed: "页面访问（统一）",
  landing_viewed: "首页访问（历史）",
  cockpit_viewed: "工作区访问（历史）",
  resume_gap_viewed: "简历工具访问（历史）",
  landing_task_clicked: "首页任务点击",
  material_intake_started: "材料导入开始",
  material_intake_completed: "材料导入完成",
  material_intake_failed: "材料导入失败",
  material_intake_deferred: "暂后处理材料",
  resume_generation_started: "简历改稿开始（历史）",
  resume_generation_completed: "简历改稿完成（历史）",
  resume_generation_failed: "简历改稿失败（历史）",
  resume_task_started: "改稿尝试",
  resume_task_outcome: "改稿结果",
  resume_result_presented: "改稿结果已展现",
  resume_change_decided: "修改决定",
  resume_document_persisted: "简历文档已保存",
  entry_selected: "选择起点",
  entry_submitted: "提交起点",
  entry_result_presented: "起点结果已展现",
  entry_failed: "起点失败",
  resume_print_requested: "请求导出 PDF",
  resume_change_reviewed: "简历建议采纳／保留",
  resume_change_edited: "简历手动编辑",
  resume_change_revalidated: "简历重新校验",
  resume_reordered: "简历区块重排",
  coach_response_received: "导师回复完成",
  coach_response_failed: "导师回复失败",
  workspace_saved: "工作区保存",
  evidence_confirmed: "确认经历证据",
  resume_preview_ready: "简历预览完成",
  resume_preview_failed: "简历预览失败",
  opportunity_material_started: "岗位材料导入开始",
  opportunity_material_completed: "岗位材料导入完成",
  opportunity_material_failed: "岗位材料导入失败",
  mock_interview_started: "模拟面试开始",
  mock_interview_completed: "模拟面试完成",
  interview_practice_started: "面试练习开始",
  interview_practice_completed: "面试练习完成",
  interview_practice_saved: "面试练习保存",
  interview_review_started: "面试复盘开始",
  interview_review_completed: "面试复盘完成",
  interview_review_failed: "面试复盘失败",
  interview_review_saved: "面试复盘保存",
  offer_calc_used: "Offer 计算",
  offer_added: "新增 Offer",
  offer_save_click: "Offer 保存点击",
  offer_save_signup: "Offer 保存转注册",
  resume_gap_used: "简历工具使用",
  resume_gap_signup: "简历工具转注册",
  resume_gap_sample_used: "简历工具示例使用",
  resume_gap_checklist_downloaded: "检查清单下载",
  resume_gap_checklist_copied: "检查清单复制",
  interview_template_started: "复盘模板开始填写",
  interview_template_sample_used: "复盘模板示例使用",
  interview_template_copied: "复盘模板复制",
  interview_template_downloaded: "复盘模板下载",
  today_action_completed: "完成今日行动",
  mentor_action_snoozed: "导师行动稍后处理",
  mentor_feedback_submitted: "导师反馈提交",
  agent_resume_saved: "Agent 简历保存",
  agent_answer_started: "Agent 作答开始",
  agent_answer_completed: "Agent 作答完成",
  agent_answer_failed: "Agent 作答失败",
  agent_job_search_completed: "Agent 岗位搜索完成",
  agent_task_partial: "Agent 任务部分完成",
  agent_answer_adopted: "Agent 作答采纳",
  agent_stage_changed: "Agent 阶段切换",
};
const LEGACY_VIEWS = new Set([
  "landing_viewed",
  "cockpit_viewed",
  "resume_gap_viewed",
]);
export const providerLabel = (x: string | null) => {
  const labels: Record<string, string> = {
    phone: "+86 手机号",
    watcha: "观猹",
    email: "邮箱",
    invite: "邀请码",
  };
  return x && Object.hasOwn(labels, x) ? labels[x] : x || "未记录";
};

const DELIVERY_OUTCOMES = ["delivered", "partial_delivered", "unchanged", "needs_detail", "blocked", "failed", "quota_denied", "unconfirmed", "running", "unknown"] as const;
/** schema_version=2 only. Old resume_generation_* rows are not added in. */
export function summarizeResumeDelivery(events: AnalyticsEvent[], now=Date.now()) {
  const current = events.filter((event) => String(event.schema_version || "") === "2");
  const generationKey=(event:AnalyticsEvent)=>event.generation_id?`${event.user_id||event.event_identity}:${event.generation_id}`:'';
  const unique = (rows: AnalyticsEvent[], key: (event: AnalyticsEvent) => string) => new Set(rows.map(key).filter(Boolean));
  const started = current.filter((event) => event.event_name === "resume_task_started");
  const outcomes = current.filter((event) => event.event_name === "resume_task_outcome");
  const outcomeByGeneration = new Map<string, AnalyticsEvent>();
  const conflicts=new Set<string>();
  for (const event of outcomes) {
    const key=generationKey(event);if(!key)continue;
    const prior=outcomeByGeneration.get(key);
    if(prior&&(prior.delivery_outcome!==event.delivery_outcome||prior.persistence!==event.persistence))conflicts.add(key);
    if(!prior||event.created_at>prior.created_at)outcomeByGeneration.set(key,event);
  }
  const counts = Object.fromEntries(DELIVERY_OUTCOMES.map((outcome) => [outcome, 0])) as Record<(typeof DELIVERY_OUTCOMES)[number], number>;
  const seen = new Set<string>();
  for (const event of outcomeByGeneration.values()) {
    const outcome = conflicts.has(generationKey(event))?'unconfirmed':(DELIVERY_OUTCOMES as readonly string[]).includes(event.delivery_outcome || "") ? event.delivery_outcome as (typeof DELIVERY_OUTCOMES)[number] : "unknown";
    counts[outcome] += 1;
    seen.add(generationKey(event));
  }
  for (const event of started) {const key=generationKey(event);if(key&&!seen.has(key)){counts[now-Date.parse(event.created_at)>330_000?'unconfirmed':'running']+=1;seen.add(key);}}
  const confirmed = (outcome: string) => [...outcomeByGeneration.values()].filter((event) => !conflicts.has(generationKey(event))&&event.delivery_outcome === outcome && event.persistence === "confirmed").length;
  const workflows = new Map<string, number>();
  for (const event of outcomeByGeneration.values()) workflows.set(event.workflow_version || "未记录", (workflows.get(event.workflow_version || "未记录") || 0) + 1);
  return {
    schemaVersion: 2,
    note: "历史 resume_generation_* 不与本口径相加。缺展现、采纳和 PDF 不倒填。",
    enabledAt: started.map((event) => event.created_at).sort()[0] || null,
    attemptsStarted: unique(started, generationKey).size,
    executableAttempts: Math.max(0, unique(started, generationKey).size - counts.quota_denied),
    outcomes: counts,
    retrievableComplete: confirmed("delivered"),
    retrievablePartial: confirmed("partial_delivered"),
    returnedOnly: [...outcomeByGeneration.values()].filter((event) => event.persistence === "returned_only").length,
    presented: unique(current.filter((event) => event.event_name === "resume_result_presented"), generationKey).size,
    changeDecisions: unique(current.filter((event) => event.event_name === "resume_change_decided"), (event) => `${generationKey(event)}:${event.change_id || event.id}`).size,
    documentsPersisted: unique(current.filter((event) => event.event_name === "resume_document_persisted"), (event) => `${generationKey(event)}:${event.document_revision||event.id}`).size,
    byWorkflow: [...workflows].map(([version, count]) => ({ version, count })).sort((a, b) => b.count - a.count || a.version.localeCompare(b.version)),
    entries:['resume','jd','find_jobs','one_sentence'].map(kind=>{
      const rows=current.filter(e=>e.entry_kind===kind);
      const count=(name:string)=>unique(rows.filter(e=>e.event_name===name),e=>`${e.user_id||e.event_identity}:${e.submission_id||e.request_id||e.id}`).size;
      return {kind,selected:count('entry_selected'),submitted:count('entry_submitted'),presented:count('entry_result_presented'),failed:count('entry_failed')};
    }),
  };
}

export function buildAnalytics(
  users: AnalyticsUser[],
  raw: AnalyticsEvent[],
  window: ReturnType<typeof analyticsWindow>,
  internal = new Set<string>(),
  internalVisitors = new Set<string>(),
  pageTrackingStartedAt?: string | null,
) {
  internal = new Set([
    ...internal,
    ...raw
      .filter((e) => e.account_cohort === "internal" && e.user_id)
      .map((e) => e.user_id!),
  ]);
  const excludedEvent = (e: AnalyticsEvent) =>
    isExcludedEvent(e, internal, internalVisitors);
  const eligibleUsers = users.filter((u) => !internal.has(u.id)),
    excluded = raw.filter(excludedEvent);
  const knownUsers = new Set(users.map((u) => u.id));
  const unmatched = raw.filter(
    (e) => !excludedEvent(e) && e.user_id && !knownUsers.has(e.user_id),
  );
  const events = raw.filter(
    (e) =>
      !excludedEvent(e) &&
      isActivityEvent(e) &&
      (!e.user_id || knownUsers.has(e.user_id)),
  );
  const unified = events.filter((e) => e.event_name === "page_viewed"),
    legacy = events.filter((e) => LEGACY_VIEWS.has(e.event_name));
  // Never add legacy view events to unified views; both can fire on the same navigation.
  // Coverage is product metadata, not inferred from the remaining visitors.
  // Removing all operator visits must give 0, not silently switch to old PV.
  const firstUnified =
    pageTrackingStartedAt ||
    raw
      .filter(
        (e) =>
          e.event_name === "page_viewed" &&
          !["development", "preview"].includes(e.environment || ""),
      )
      .map((e) => e.created_at)
      .sort()[0] ||
    null;
  const unifiedInWindow = firstUnified && firstUnified < window.end;
  const views = unifiedInWindow ? unified : legacy,
    trafficMode = unifiedInWindow ? "unified" : "legacy";
  const unique = (rows: AnalyticsEvent[]) =>
    new Set(rows.map((e) => e.event_identity).filter(Boolean)).size;
  const identityEvents = new Map<string, AnalyticsEvent[]>(),
    userEvents = new Map<string, AnalyticsEvent[]>();
  for (const e of events) {
    if (e.event_identity) {
      const a = identityEvents.get(e.event_identity) || [];
      a.push(e);
      identityEvents.set(e.event_identity, a);
    }
    if (e.user_id) {
      const a = userEvents.get(e.user_id) || [];
      a.push(e);
      userEvents.set(e.user_id, a);
    }
  }
  const usage = [...identityEvents.values()].map(estimateUsage),
    seconds = usage.reduce((n, u) => n + u.seconds, 0),
    sessions = usage.reduce((n, u) => n + u.sessions, 0);
  const today = analyticsDay(window.end),
    cohorts = new Map<
      string,
      { day: string; registered: number; returned: number; mature: boolean }
    >();
  const startDay = analyticsDay(window.start),
    activityDays = new Map(
      [...userEvents].map(([id, rows]) => [
        id,
        new Set(rows.map((e) => analyticsDay(e.created_at))),
      ]),
    );
  for (const u of eligibleUsers) {
    const day = analyticsDay(u.created_at);
    if (day < startDay || day > today) continue;
    const next = new Date(Date.parse(day + "T00:00:00Z") + DAY)
      .toISOString()
      .slice(0, 10);
    const c = cohorts.get(day) || {
      day,
      registered: 0,
      returned: 0,
      mature: next < today,
    };
    c.registered++;
    if (activityDays.get(u.id)?.has(next)) c.returned++;
    cohorts.set(day, c);
  }
  const cohortRows = [...cohorts.values()].sort((a, b) =>
    b.day.localeCompare(a.day),
  );
  const mature = cohortRows.filter((c) => c.mature),
    denominator = mature.reduce((n, c) => n + c.registered, 0),
    numerator = mature.reduce((n, c) => n + c.returned, 0);
  const grouped = new Map<string, AnalyticsEvent[]>();
  for (const e of events) {
    const a = grouped.get(e.event_name) || [];
    a.push(e);
    grouped.set(e.event_name, a);
  }
  const sources = new Map<string, AnalyticsEvent[]>();
  for (const e of views) {
    const k = e.source || "未记录",
      a = sources.get(k) || [];
    a.push(e);
    sources.set(k, a);
  }
  // V2 is a new observation baseline, not a rewrite of historical first-touch tags.
  const attributed = views.filter((e) => String(e.attribution_version) === "2" && isAcquisitionSource(e.first_source) && isAcquisitionSource(e.session_source));
  const sourceRows = (key: "first_source" | "session_source") => {
    const buckets = new Map<string, AnalyticsEvent[]>();
    for (const e of attributed) {
      const rows = buckets.get(e[key]!) || [];
      rows.push(e);
      buckets.set(e[key]!, rows);
    }
    return [...buckets].map(([source, rows]) => ({ source, pv: rows.length, uv: unique(rows) })).sort((a, b) => b.pv - a.pv || a.source.localeCompare(b.source));
  };
  const daily = Array.from({ length: window.days }, (_, i) => {
    const day = analyticsDay(Date.parse(window.start) + i * DAY),
      rows = views.filter((e) => analyticsDay(e.created_at) === day);
    return {
      day,
      pv:
        trafficMode === "unified" &&
        firstUnified &&
        day < analyticsDay(firstUnified)
          ? null
          : rows.length,
      uv: unique(rows),
      registered: eligibleUsers.filter(
        (u) => analyticsDay(u.created_at) === day,
      ).length,
    };
  });
  return {
    window,
    generatedAt: window.end,
    traffic: {
      mode: trafficMode,
      uv: unique(views),
      pv: views.length,
      firstUnified,
      legacyPv: legacy.length,
      legacyUv: unique(legacy),
      knownHostViews: views.filter((e) => e.host).length,
    },
    totals: {
      users: eligibleUsers.length,
      excludedUsers: users.length - eligibleUsers.length,
      newUsers: cohortRows.reduce((n, c) => n + c.registered, 0),
      activeUsers: userEvents.size,
      events: events.length,
      excludedEvents: excluded.length,
      unmatchedEvents: unmatched.length,
      diagnosticEvents: raw.filter(
        (e) =>
          !excludedEvent(e) &&
          !isActivityEvent(e) &&
          (!e.user_id || knownUsers.has(e.user_id)),
      ).length,
    },
    usage: {
      averageSeconds: sessions ? seconds / sessions : null,
      seconds,
      sessions,
      singleEventSessions: usage.reduce((n, u) => n + u.singleEventSessions, 0),
    },
    retention: {
      numerator,
      denominator,
      rate: denominator ? numerator / denominator : null,
      pending: cohortRows
        .filter((c) => !c.mature)
        .reduce((n, c) => n + c.registered, 0),
      cohorts: cohortRows,
    },
    daily,
    features: [...grouped]
      .map(([name, rows]) => ({
        name,
        label: Object.hasOwn(EVENT_LABELS, name) ? EVENT_LABELS[name] : name,
        count: rows.length,
        identities: unique(rows),
        users: new Set(rows.map((e) => e.user_id).filter(Boolean)).size,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    sources: [...sources]
      .map(([source, rows]) => ({ source, pv: rows.length, uv: unique(rows) }))
      .sort((a, b) => b.pv - a.pv),
    acquisition: {
      trackedPv: attributed.length,
      untrackedPv: views.length - attributed.length,
      firstObserved: attributed.map((e) => e.created_at).sort()[0] || null,
      sessionSources: sourceRows("session_source"),
      firstSources: sourceRows("first_source"),
    },
    resumeDelivery: summarizeResumeDelivery(raw.filter((e) => !excludedEvent(e)&&(!e.user_id||knownUsers.has(e.user_id))),Date.parse(window.end)),
    users: eligibleUsers.map((u) => {
      const rows = userEvents.get(u.id) || [],
        usage = estimateUsage(rows);
      return {
        ...u,
        providerLabel: providerLabel(u.provider),
        eventCount: rows.length,
        lastEventAt:
          rows
            .map((e) => e.created_at)
            .sort()
            .at(-1) || null,
        ...usage,
      };
    }),
  };
}
export type AnalyticsSummary = ReturnType<typeof buildAnalytics>;
