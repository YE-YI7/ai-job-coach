import type { Opportunity, OpportunityAction } from "@/lib/opportunities/types";
import type { CoachActionType } from "./types";

export type MentorActionTab = "overview" | "evidence" | "resume" | "interview" | "review" | "activity";

export interface MentorNextAction {
  id: string;
  opportunityId: string | null;
  company: string | null;
  role: string | null;
  title: string;
  reason: string;
  dueLabel: string;
  priority: number;
  actionType: CoachActionType | "onboarding";
  tab: MentorActionTab;
  cost: "free" | "credits";
  source: "system" | "opportunity_action" | "evidence_gap";
  sourceActionId?: string;
}

const priorityWeight = { urgent: 30, high: 18, normal: 6 } as const;

function daysUntil(value: string | null | undefined, now: Date) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.ceil((timestamp - now.getTime()) / 86_400_000);
}

function classifyAction(action: OpportunityAction): Pick<MentorNextAction, "actionType" | "tab" | "cost"> {
  const text = `${action.title} ${action.reason}`;
  if (/复盘|回顾|逐字稿/.test(text)) return { actionType: "interview_review", tab: "review", cost: "credits" };
  if (/面试|练习|追问|题/.test(text)) return { actionType: "mock_interview", tab: "interview", cost: "credits" };
  if (/简历|改写|版本/.test(text)) return { actionType: "resume_workshop", tab: "resume", cost: "credits" };
  if (/跟进|催|回复|感谢信/.test(text)) return { actionType: "follow_up", tab: "activity", cost: "free" };
  if (/网申|申请表|投递/.test(text)) return { actionType: "application_assist", tab: "overview", cost: "free" };
  if (/项目|故事/.test(text)) return { actionType: "project_deep_dive", tab: "evidence", cost: "free" };
  return { actionType: "job_decision", tab: "evidence", cost: "free" };
}

function dueScore(label: string) {
  if (/今天|立即|现在|逾期/.test(label)) return 32;
  if (/明天|24\s*小时/.test(label)) return 24;
  if (/本周|投递前|面试前/.test(label)) return 12;
  return 0;
}

function stageScore(opportunity: Opportunity) {
  if (opportunity.stage === "interviewing") return 32;
  if (opportunity.stage === "negotiating") return 24;
  if (opportunity.stage === "preparing_application") return 18;
  if (opportunity.stage === "applied") return 12;
  if (opportunity.stage === "evaluating" || opportunity.stage === "captured") return 10;
  return -40;
}

function actionCandidate(opportunity: Opportunity, action: OpportunityAction): MentorNextAction {
  const classified = classifyAction(action);
  const decisiveEvidence = opportunity.requirements.some((item) =>
    item.importance === "critical" && (item.strength === "missing" || item.strength === "unverified")
  );
  const evidenceBoost = classified.tab === "evidence" && decisiveEvidence ? 28 : 0;
  return {
    id: `${opportunity.id}:${action.id}`,
    opportunityId: opportunity.id,
    company: opportunity.company,
    role: opportunity.role,
    title: action.title,
    reason: action.reason,
    dueLabel: action.dueLabel,
    priority: priorityWeight[action.priority] + dueScore(action.dueLabel) + stageScore(opportunity) + evidenceBoost,
    ...classified,
    source: "opportunity_action",
    sourceActionId: action.id,
  };
}

function interviewCandidate(opportunity: Opportunity, now: Date): MentorNextAction | null {
  if (opportunity.stage !== "interviewing") return null;
  const scheduledTimestamp = opportunity.scheduledInterviewAt ? new Date(opportunity.scheduledInterviewAt).getTime() : null;
  if (scheduledTimestamp !== null && Number.isFinite(scheduledTimestamp) && scheduledTimestamp < now.getTime()) {
    return {
      id: `${opportunity.id}:interview-review`, opportunityId: opportunity.id,
      company: opportunity.company, role: opportunity.role,
      title: "先复盘刚结束的面试",
      reason: "趁记忆仍然清晰，先保存真实问题、回答和卡点，再安排下一轮训练。",
      dueLabel: "现在", priority: 132,
      actionType: "interview_review", tab: "review", cost: "credits", source: "system",
    };
  }
  const days = daysUntil(opportunity.scheduledInterviewAt, now);
  const label = days === null ? opportunity.nextEventLabel || "面试前" : days <= 0 ? "今天" : days === 1 ? "明天" : `${days} 天后`;
  const needsEvidence = opportunity.requirements.find((item) =>
    item.importance === "critical" && (item.strength === "missing" || item.strength === "unverified")
  );
  if (needsEvidence) {
    return {
      id: `${opportunity.id}:interview-evidence`, opportunityId: opportunity.id,
      company: opportunity.company, role: opportunity.role,
      title: `先补齐面试会追问的关键事实`,
      reason: `“${needsEvidence.requirement}”仍没有可靠证据，直接模拟会把问题带进错误答案。`,
      dueLabel: label, priority: 126 - Math.max(days ?? 3, 0) * 4,
      actionType: "job_decision", tab: "evidence", cost: "free", source: "evidence_gap",
    };
  }
  return {
    id: `${opportunity.id}:mock-interview`, opportunityId: opportunity.id,
    company: opportunity.company, role: opportunity.role,
    title: `按当前岗位做一轮模拟面试`,
    reason: "面试已进入日程，优先验证回答中的薄弱证据和追问风险。",
    dueLabel: label, priority: 118 - Math.max(days ?? 3, 0) * 5,
    actionType: "mock_interview", tab: "interview", cost: "credits", source: "system",
  };
}

function fallbackCandidate(opportunity: Opportunity): MentorNextAction | null {
  if (["won", "lost", "withdrawn", "archived"].includes(opportunity.stage)) return null;
  if (opportunity.workspaceType === "preparation") {
    const targetMissing = !opportunity.role || opportunity.role === "目标待确认";
    return {
      id: `${opportunity.id}:preparation`, opportunityId: opportunity.id,
      company: opportunity.company, role: opportunity.role,
      title: targetMissing ? "先明确一个目标岗位方向" : opportunity.resumeText ? "把基础简历拆成可复用的经历证据" : "补充一份基础简历或经历材料",
      reason: targetMissing ? "方向不明确时，继续改简历只会增加无效工作。" : opportunity.resumeText ? "先建立事实底稿，后续每个岗位版本才能保持一致。" : "没有真实经历底稿，导师无法可靠地安排简历和面试训练。",
      dueLabel: "今天", priority: 76, actionType: "project_deep_dive", tab: opportunity.resumeText ? "evidence" : "resume", cost: "free", source: "system",
    };
  }
  const missingCritical = opportunity.requirements.find((item) => item.importance === "critical" && item.strength === "missing");
  if (missingCritical) {
    return {
      id: `${opportunity.id}:critical-gap`, opportunityId: opportunity.id,
      company: opportunity.company, role: opportunity.role,
      title: "补一条会改变投递结论的经历证据",
      reason: `“${missingCritical.requirement}”是硬要求，目前仍无证据。`, dueLabel: "今天", priority: 82,
      actionType: "job_decision", tab: "evidence", cost: "free", source: "evidence_gap",
    };
  }
  if (opportunity.stage === "applied") {
    return {
      id: `${opportunity.id}:follow-up`, opportunityId: opportunity.id,
      company: opportunity.company, role: opportunity.role,
      title: "检查投递进展并准备跟进", reason: "已投递岗位不能只等待；同步进展后，导师才能安排面试准备或跟进。",
      dueLabel: "本周", priority: 42, actionType: "follow_up", tab: "activity", cost: "free", source: "system",
    };
  }
  return {
    id: `${opportunity.id}:decision`, opportunityId: opportunity.id,
    company: opportunity.company, role: opportunity.role,
    title: "完成这个岗位的投递判断", reason: "先判断是否值得投入，再决定是否定制简历。",
    dueLabel: "今天", priority: 56, actionType: "job_decision", tab: "overview", cost: "free", source: "system",
  };
}

export function planMentorActions(opportunities: Opportunity[], now = new Date()): MentorNextAction[] {
  if (!opportunities.length) {
    return [{
      id: "onboarding:first-material", opportunityId: null, company: null, role: null,
      title: "把你手头的一份材料交给我", reason: "简历、岗位链接或求职目标任选一个；导师会据此安排第一步。",
      dueLabel: "现在", priority: 100, actionType: "onboarding", tab: "overview", cost: "free", source: "system",
    }];
  }

  const candidates = opportunities.flatMap((opportunity) => {
    if (["won", "lost", "withdrawn", "archived"].includes(opportunity.stage)) return [];
    const interview = interviewCandidate(opportunity, now);
    const pending = opportunity.actions.filter((action) => action.status === "todo").map((action) => actionCandidate(opportunity, action));
    const fallback = pending.length || interview ? [] : [fallbackCandidate(opportunity)].filter(Boolean) as MentorNextAction[];
    const snoozed = new Map((opportunity.mentorSnoozes || []).map((item) => [item.actionId, item.until]));
    return [...(interview ? [interview] : []), ...pending, ...fallback].filter((candidate) => {
      const until = snoozed.get(candidate.id);
      return !until || new Date(until).getTime() <= now.getTime();
    });
  });

  return candidates.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export function getTodayMentorPlan(opportunities: Opportunity[], now = new Date()) {
  const actions = planMentorActions(opportunities, now);
  const todayCount = actions.filter((action) => /今天|现在|立即|明天|逾期/.test(action.dueLabel)).length;
  return { focus: actions[0], actions, todayCount: Math.max(todayCount, actions.length ? 1 : 0) };
}
