import type { Opportunity } from "@/lib/opportunities/types";
import { getTodayMentorPlan, type MentorNextAction } from "./next-action";
import {
  civilDateKey,
  latestConfirmedProgress,
  resolveUserTimeZone,
  weeklyConfirmedProgress,
  type ConfirmedProgressItem,
  type ProgressTab,
  type WeekRange,
} from "./today-progress";

export type TodayTab = ProgressTab;

export interface TodayCompanionSummary {
  goalTitle: string;
  stepTitle: string | null;
  effort: string | null;
  weeklyHours: string | null;
  deadline: string | null;
  action: string;
}

export interface TodayTask {
  id: string;
  title: string;
  why: string;
  dueLabel: string | null;
  effort: string | null;
  tab: TodayTab | null;
  target: "tab" | "arrangement";
  opportunityId: string | null;
  sourceActionId?: string;
  source: MentorNextAction["source"] | "onboarding";
  completion: "self_report";
}

export interface TodayView {
  greeting: string;
  dateLabel: string;
  todayKey: string;
  timeZone: string;
  mentorLine: string;
  goalTitle: string | null;
  goalNote: string | null;
  active: { id: string; company: string; role: string; stageLabel: string; nextEventLabel: string | null } | null;
  tasks: TodayTask[];
  emptyLine: string | null;
  latest: ConfirmedProgressItem | null;
  week: WeekRange;
  weekly: ConfirmedProgressItem[];
}

function hourInZone(now: Date, timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
  return Number.isFinite(hour) ? hour : 9;
}

function greetingFor(hour: number) {
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function dateLabel(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(now);
}

function toTask(action: MentorNextAction): TodayTask {
  return {
    id: action.id,
    title: action.title,
    why: action.reason,
    dueLabel: action.dueLabel || null,
    // The planner has no measured duration; only a companion step carries a real effort.
    effort: null,
    tab: action.tab === "activity" ? "overview" : action.tab,
    target: "tab",
    opportunityId: action.opportunityId,
    sourceActionId: action.sourceActionId,
    source: action.source,
    completion: "self_report",
  };
}

function companionTaskFor(companion: TodayCompanionSummary | null, opportunityId: string | null): TodayTask | null {
  if (!companion?.stepTitle) return null;
  if (companion.action === "ended" || companion.action === "skipped") return null;
  return {
    id: "companion:current-step",
    title: companion.stepTitle,
    why: `这是你为「${companion.goalTitle}」定下的下一步；做完提交给导师看，再判断。`,
    dueLabel: null,
    effort: companion.effort,
    tab: null,
    target: "arrangement",
    opportunityId,
    source: "system",
    completion: "self_report",
  };
}

function mentorLine(params: {
  latest: ConfirmedProgressItem | null;
  focus: TodayTask | null;
  companion: TodayCompanionSummary | null;
  hasOpportunity: boolean;
}) {
  const { latest, focus, companion, hasOpportunity } = params;
  const last = latest ? `上次你留下了「${latest.title}」（${latest.timeLabel}）。` : "";
  if (focus) {
    if (companion?.stepTitle && focus.target === "arrangement") {
      return `${last}你正在「${companion.goalTitle}」。下一步是「${focus.title}」。今天不用再堆新任务。`;
    }
    return latest
      ? `${last}今天先接着做「${focus.title}」。`
      : `${last}还没有确认过的产出。今天先从「${focus.title}」开始，做完再判断。`;
  }
  if (companion) {
    return `${last}「${companion.goalTitle}」这段目标已经收尾，今天不用新增任务；想继续时再开一段。`;
  }
  if (latest) return `${last}今天不用硬加新任务，想继续时从下面的入口进去就好。`;
  return hasOpportunity
    ? "这个工作区还没有确认过的产出。今天先做完一件能留下材料的小事。"
    : "还没有留下已确认的材料。今天先选一份简历、一个岗位，或者说一句想解决的事。";
}

export function buildTodayView(input: {
  opportunities: Opportunity[];
  activeId?: string | null;
  now?: Date;
  timeZone?: string;
  companion?: TodayCompanionSummary | null;
  /** A companion goal can be saved without a job; link that step to its own scope. */
  companionOpportunityId?: string | null;
}): TodayView {
  const now = input.now || new Date();
  const timeZone = input.timeZone || resolveUserTimeZone();
  const active = input.opportunities.find((item) => item.id === input.activeId) || input.opportunities[0] || null;
  const plan = getTodayMentorPlan(input.opportunities, now);
  // An onboarding prompt belongs to the four-door empty workspace, not to Today.
  const planned = plan.actions.filter((action) => action.actionType !== "onboarding");
  const activeTasks = planned.filter((action) => active && action.opportunityId === active.id);
  const otherTasks = planned.filter((action) => !active || action.opportunityId !== active.id);
  const companion = input.companion || null;
  const companionOpportunityId = input.companionOpportunityId !== undefined
    ? input.companionOpportunityId
    : active?.id ?? null;
  const companionTask = companionTaskFor(companion, companionOpportunityId);
  const tasks = [companionTask, ...activeTasks.map(toTask), ...otherTasks.map(toTask)]
    .filter((task): task is TodayTask => Boolean(task))
    .slice(0, 3);
  const latest = latestConfirmedProgress(input.opportunities, timeZone);
  const weekly = weeklyConfirmedProgress(input.opportunities, now, timeZone);
  const focus = tasks[0] || null;
  const goalTitle = companion?.goalTitle || (active ? (active.workspaceType === "preparation" ? active.role : `${active.company} · ${active.role}`) : null);
  const goalBits = [
    active?.stageLabel,
    active?.nextEventLabel,
    companion?.weeklyHours,
    companion?.deadline,
  ].filter(Boolean);
  const emptyLine = tasks.length
    ? null
    : active
      ? "今天不用新增任务，已经收尾的事不会再催你。"
      : companion
        ? "今天不用新增任务；这段目标已经收尾，想继续时再开一段。"
        : "今天可以不加新任务；想开始的话，从简历、岗位或一句话里选一个。";
  return {
    greeting: greetingFor(hourInZone(now, timeZone)),
    dateLabel: dateLabel(now, timeZone),
    todayKey: civilDateKey(now, timeZone) || "",
    timeZone,
    mentorLine: mentorLine({ latest, focus, companion, hasOpportunity: Boolean(active) }),
    goalTitle,
    goalNote: goalBits.length ? goalBits.join(" · ") : null,
    active: active ? { id: active.id, company: active.company, role: active.role, stageLabel: active.stageLabel, nextEventLabel: active.nextEventLabel } : null,
    tasks,
    emptyLine,
    latest,
    week: weekly.week,
    weekly: weekly.items,
  };
}
