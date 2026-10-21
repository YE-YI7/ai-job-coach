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
  event_identity: string | null;
  event_name: string;
  created_at: string;
  source?: string | null;
  page?: string | null;
  host?: string | null;
  environment?: string | null;
  account_cohort?: string | null;
  qa?: string | boolean | null;
  is_test?: string | boolean | null;
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
  return new Set(
    raw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );
}
const marked = (x: unknown) => x === true || x === "true" || x === "1";
export function isExcludedEvent(e: AnalyticsEvent, ids: Set<string>) {
  return (
    Boolean(e.user_id && ids.has(e.user_id)) ||
    e.account_cohort === "internal" ||
    marked(e.qa) ||
    marked(e.is_test) ||
    /^growth-qa(?:-|$)/.test(e.source || "") ||
    ["development", "preview"].includes(e.environment || "")
  );
}
// Server-only traces are diagnostics, not evidence of a person returning to use the app.
export const isActivityEvent = (e: AnalyticsEvent) =>
  e.event_name !== "resume_agent_trace";
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
  resume_generation_started: "简历改稿开始",
  resume_generation_completed: "简历改稿完成",
  resume_generation_failed: "简历改稿失败",
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

export function buildAnalytics(
  users: AnalyticsUser[],
  raw: AnalyticsEvent[],
  window: ReturnType<typeof analyticsWindow>,
  internal = new Set<string>(),
) {
  internal = new Set([
    ...internal,
    ...raw
      .filter((e) => e.account_cohort === "internal" && e.user_id)
      .map((e) => e.user_id!),
  ]);
  const eligibleUsers = users.filter((u) => !internal.has(u.id)),
    excluded = raw.filter((e) => isExcludedEvent(e, internal));
  const knownUsers = new Set(users.map((u) => u.id));
  const unmatched = raw.filter(
    (e) =>
      !isExcludedEvent(e, internal) && e.user_id && !knownUsers.has(e.user_id),
  );
  const events = raw.filter(
    (e) =>
      !isExcludedEvent(e, internal) &&
      isActivityEvent(e) &&
      (!e.user_id || knownUsers.has(e.user_id)),
  );
  const unified = events.filter((e) => e.event_name === "page_viewed"),
    legacy = events.filter((e) => LEGACY_VIEWS.has(e.event_name));
  // Never add legacy view events to unified views; both can fire on the same navigation.
  const views = unified.length ? unified : legacy,
    trafficMode = unified.length ? "unified" : "legacy";
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
  const firstUnified = unified.map((e) => e.created_at).sort()[0] || null;
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
      newUsers: cohortRows.reduce((n, c) => n + c.registered, 0),
      activeUsers: userEvents.size,
      events: events.length,
      excludedEvents: excluded.length,
      unmatchedEvents: unmatched.length,
      diagnosticEvents: raw.filter(
        (e) =>
          !isExcludedEvent(e, internal) &&
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
