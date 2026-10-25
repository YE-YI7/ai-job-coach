import type { Opportunity } from "@/lib/opportunities/types";

export type ProgressTab = "overview" | "evidence" | "resume" | "interview" | "review" | "salary";

export interface ConfirmedProgressItem {
  id: string;
  opportunityId: string;
  company: string;
  role: string;
  title: string;
  sourceLabel: string;
  statusLabel: string;
  tab: ProgressTab;
  occurredAt: string;
  dateKey: string;
  timeLabel: string;
}

export interface WeekRange {
  startKey: string;
  endKey: string;
  label: string;
}

const SNAPSHOT_LABELS: Record<string, string> = {
  jd: "岗位 JD",
  base_resume: "基础简历",
  submitted_resume: "投递简历",
  application_answers: "投递问答",
  interview_brief: "面试准备",
  interview_feedback: "面试反馈",
  outcome: "结果记录",
};

const SNAPSHOT_TABS: Record<string, ProgressTab> = {
  jd: "overview",
  base_resume: "resume",
  submitted_resume: "resume",
  application_answers: "overview",
  interview_brief: "interview",
  interview_feedback: "review",
  outcome: "overview",
};

const DEFAULT_TIME_ZONE = "Asia/Shanghai";

export function resolveUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = read("year");
  const month = read("month");
  const day = read("day");
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

function keyFromParts(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function keyToUtc(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(key: string, days: number) {
  const date = keyToUtc(key);
  date.setUTCDate(date.getUTCDate() + days);
  return keyFromParts({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}

/** The user's civil date for an instant, not the server's local date. */
export function civilDateKey(value: string | Date, timeZone = DEFAULT_TIME_ZONE): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = partsInZone(date, timeZone);
  return parts ? keyFromParts(parts) : null;
}

/** Monday-based civil week, with both ends inclusive. */
export function weekRange(now: Date, timeZone = DEFAULT_TIME_ZONE): WeekRange {
  const todayKey = civilDateKey(now, timeZone);
  if (!todayKey) return { startKey: "", endKey: "", label: "" };
  const weekday = keyToUtc(todayKey).getUTCDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  const startKey = addDays(todayKey, -offset);
  const endKey = addDays(startKey, 6);
  const start = keyToUtc(startKey);
  const end = keyToUtc(endKey);
  const label = `${start.getUTCMonth() + 1}月${start.getUTCDate()}日 – ${end.getUTCMonth() + 1}月${end.getUTCDate()}日`;
  return { startKey, endKey, label };
}

function timeLabel(value: string, timeZone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function item(
  opportunity: Opportunity,
  source: { id: string; title: string; sourceLabel: string; statusLabel: string; tab: ProgressTab; occurredAt: string },
  timeZone: string,
): ConfirmedProgressItem | null {
  const dateKey = civilDateKey(source.occurredAt, timeZone);
  if (!dateKey) return null;
  return {
    id: `${opportunity.id}:${source.id}`,
    opportunityId: opportunity.id,
    company: opportunity.company,
    role: opportunity.role,
    title: source.title,
    sourceLabel: source.sourceLabel,
    statusLabel: source.statusLabel,
    tab: source.tab,
    occurredAt: new Date(source.occurredAt).toISOString(),
    dateKey,
    timeLabel: timeLabel(source.occurredAt, timeZone),
  };
}

/**
 * Only artifacts that were actually produced are progress.
 * Actions, clicks and self-reported "done" have no confirmed output and stay out.
 */
export function collectConfirmedProgress(
  opportunities: Opportunity[],
  timeZone = DEFAULT_TIME_ZONE,
): ConfirmedProgressItem[] {
  const items: ConfirmedProgressItem[] = [];
  for (const opportunity of opportunities) {
    for (const snapshot of opportunity.snapshots || []) {
      const label = SNAPSHOT_LABELS[snapshot.snapshotType] || "已保存材料";
      const next = item(opportunity, {
        id: `snapshot:${snapshot.id}`,
        title: snapshot.title || `${label} v${snapshot.version}`,
        sourceLabel: `${label} v${snapshot.version}`,
        statusLabel: "已冻结",
        tab: SNAPSHOT_TABS[snapshot.snapshotType] || "overview",
        occurredAt: snapshot.frozenAt,
      }, timeZone);
      if (next) items.push(next);
    }
    for (const session of opportunity.mockInterviews || []) {
      if (session.status !== "completed") continue;
      const next = item(opportunity, {
        id: `mock:${session.id}`,
        title: session.summary?.grade ? `${session.round} · ${session.summary.grade}` : `${session.round}已完成`,
        sourceLabel: "模拟面试",
        statusLabel: "已完成整轮",
        tab: "interview",
        occurredAt: session.createdAt,
      }, timeZone);
      if (next) items.push(next);
    }
    for (const report of opportunity.reviewReports || []) {
      const next = item(opportunity, {
        id: `review:${report.id}`,
        title: `${report.round}复盘 · ${report.grade}`,
        sourceLabel: "面试复盘报告",
        statusLabel: "已出报告",
        tab: "review",
        occurredAt: report.createdAt,
      }, timeZone);
      if (next) items.push(next);
    }
  }
  return items.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.id.localeCompare(b.id));
}

export function latestConfirmedProgress(
  opportunities: Opportunity[],
  timeZone = DEFAULT_TIME_ZONE,
): ConfirmedProgressItem | null {
  return collectConfirmedProgress(opportunities, timeZone)[0] || null;
}

export function weeklyConfirmedProgress(
  opportunities: Opportunity[],
  now: Date,
  timeZone = DEFAULT_TIME_ZONE,
) {
  const week = weekRange(now, timeZone);
  const todayKey = civilDateKey(now, timeZone) || week.endKey;
  const items = collectConfirmedProgress(opportunities, timeZone).filter(
    (entry) => entry.dateKey >= week.startKey && entry.dateKey <= todayKey,
  );
  return { week, items };
}
