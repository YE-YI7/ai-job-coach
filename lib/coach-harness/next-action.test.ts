import { demoOpportunities } from "@/lib/opportunities/demo";
import type { Opportunity } from "@/lib/opportunities/types";
import { getTodayMentorPlan, planMentorActions } from "./next-action";

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    ...demoOpportunities[0],
    id: "test-opportunity",
    company: "测试公司",
    role: "AI 产品经理",
    actions: [],
    requirements: [],
    activities: [],
    resumeChanges: [],
    interviewFocus: [],
    ...overrides,
  };
}

describe("mentor next action planner", () => {
  test("starts from any raw material when the user has no opportunity", () => {
    expect(planMentorActions([])[0]).toMatchObject({ actionType: "onboarding", cost: "free" });
  });

  test("prioritizes an imminent interview across opportunities", () => {
    const actions = planMentorActions([
      opportunity({ id: "apply", stage: "preparing_application", actions: [{ id: "a", title: "修改简历", reason: "准备投递", dueLabel: "今天", priority: "urgent", status: "todo" }] }),
      opportunity({ id: "interview", stage: "interviewing", scheduledInterviewAt: "2026-08-18T02:00:00Z" }),
    ], new Date("2026-08-17T02:00:00Z"));
    expect(actions[0]).toMatchObject({ opportunityId: "interview", actionType: "mock_interview" });
  });

  test("blocks mock interview behind an unverified critical fact", () => {
    const actions = planMentorActions([opportunity({
      stage: "interviewing",
      scheduledInterviewAt: "2026-08-17T12:00:00Z",
      requirements: [{ id: "r", requirement: "收入结果", importance: "critical", strength: "unverified", evidence: "待确认", source: null, verified: false }],
    })], new Date("2026-08-17T02:00:00Z"));
    expect(actions[0]).toMatchObject({ tab: "evidence", source: "evidence_gap", cost: "free" });
  });

  const classifications = [
    ["复盘今天的一面", "interview_review", "review", "credits"],
    ["练习产品题", "mock_interview", "interview", "credits"],
    ["审阅岗位简历 V1", "resume_workshop", "resume", "credits"],
    ["给 HR 发跟进", "follow_up", "activity", "free"],
    ["完成网申", "application_assist", "overview", "free"],
    ["整理项目故事", "project_deep_dive", "evidence", "free"],
    ["确认商业化指标", "job_decision", "evidence", "free"],
  ] as const;

  test.each(classifications)("classifies %s", (title, actionType, tab, cost) => {
    const result = planMentorActions([opportunity({ actions: [{ id: "a", title, reason: "原因", dueLabel: "今天", priority: "high", status: "todo" }] })])[0];
    expect(result).toMatchObject({ actionType, tab, cost });
  });

  test.each(["won", "lost", "withdrawn", "archived"] as const)("does not invent work for %s opportunities", (stage) => {
    expect(planMentorActions([opportunity({ stage })])).toHaveLength(0);
  });

  test("creates a free follow-up for an applied opportunity without actions", () => {
    expect(planMentorActions([opportunity({ stage: "applied" })])[0]).toMatchObject({ actionType: "follow_up", cost: "free" });
  });

  test("creates a decision action for a captured opportunity", () => {
    expect(planMentorActions([opportunity({ stage: "captured" })])[0]).toMatchObject({ actionType: "job_decision", tab: "overview" });
  });

  test("preparation workspace asks for a target before pretending to tailor", () => {
    const result = planMentorActions([opportunity({ workspaceType: "preparation", role: "目标待确认", stage: "evaluating" })])[0];
    expect(result).toMatchObject({ title: "先明确一个目标岗位方向", cost: "free" });
  });

  test("raises a missing critical requirement before generic decision work", () => {
    const result = planMentorActions([opportunity({
      stage: "captured",
      requirements: [{ id: "r", requirement: "模型评测", importance: "critical", strength: "missing", evidence: "无", source: null, verified: false }],
    })])[0];
    expect(result).toMatchObject({ source: "evidence_gap", tab: "evidence" });
  });

  test("counts only near-term work in Today ToDo", () => {
    const plan = getTodayMentorPlan([opportunity({ actions: [
      { id: "today", title: "确认指标", reason: "影响判断", dueLabel: "今天", priority: "high", status: "todo" },
      { id: "later", title: "练习面试", reason: "之后准备", dueLabel: "下个月", priority: "normal", status: "todo" },
    ] })]);
    expect(plan.todayCount).toBe(1);
  });

  test("urgent work wins within the same stage", () => {
    const result = planMentorActions([opportunity({ actions: [
      { id: "normal", title: "准备项目故事", reason: "普通", dueLabel: "本周", priority: "normal", status: "todo" },
      { id: "urgent", title: "确认关键证据", reason: "紧急", dueLabel: "今天", priority: "urgent", status: "todo" },
    ] })]);
    expect(result[0].sourceActionId).toBe("urgent");
  });

  test("completed and snoozed actions are excluded", () => {
    const result = planMentorActions([opportunity({ actions: [
      { id: "done", title: "完成", reason: "完成", dueLabel: "今天", priority: "urgent", status: "done" },
      { id: "snoozed", title: "暂停", reason: "暂停", dueLabel: "今天", priority: "urgent", status: "snoozed" },
    ] })]);
    expect(result.every((item) => !item.sourceActionId)).toBe(true);
  });

  test("a mentor action stays hidden until its snooze expires", () => {
    const base = opportunity({ stage: "captured" });
    const actionId = `${base.id}:decision`;
    const hidden = planMentorActions([{ ...base, mentorSnoozes: [{ actionId, until: "2026-08-18T10:00:00Z" }] }], new Date("2026-08-17T10:00:00Z"));
    const returned = planMentorActions([{ ...base, mentorSnoozes: [{ actionId, until: "2026-08-18T10:00:00Z" }] }], new Date("2026-08-19T10:00:00Z"));
    expect(hidden).toHaveLength(0);
    expect(returned[0]?.id).toBe(actionId);
  });
});
