import type { Opportunity } from "@/lib/opportunities/types";
import { buildTodayView } from "./today-view";

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opp-1",
    company: "测试公司",
    role: "产品经理",
    location: "上海",
    stage: "preparing_application",
    stageLabel: "准备投递",
    priority: "medium",
    sourceLabel: "手动创建",
    capturedAtLabel: "2026-10-20",
    nextEventLabel: null,
    recommendation: "worth_applying",
    recommendationLabel: "值得投递",
    recommendationReason: "材料匹配",
    evidenceCoverage: { strong: 0, weak: 0, missing: 0, unverified: 0 },
    requirements: [],
    actions: [],
    activities: [],
    resumeChanges: [],
    interviewFocus: [],
    ...overrides,
  } as Opportunity;
}

const NOW = new Date("2026-10-24T10:00:00+08:00");

describe("today view", () => {
  test("greeting and date follow the user's calendar", () => {
    const view = buildTodayView({ opportunities: [], now: NOW, timeZone: "Asia/Shanghai" });
    expect(view.greeting).toBe("早上好");
    expect(view.dateLabel).toContain("10月24日");
    expect(view.todayKey).toBe("2026-10-24");
  });

  test("new users are told there is no confirmed history instead of inventing one", () => {
    const view = buildTodayView({
      opportunities: [opportunity({ actions: [{ id: "a1", title: "补齐一条硬性要求", reason: "缺证据", dueLabel: "今天", priority: "urgent", status: "todo" }] })],
      activeId: "opp-1",
      now: NOW,
      timeZone: "Asia/Shanghai",
    });
    expect(view.mentorLine).toContain("还没有确认过的产出");
    expect(view.mentorLine).toContain("补齐一条硬性要求");
    expect(view.latest).toBeNull();
    expect(view.tasks).toHaveLength(1);
    expect(view.tasks[0]).toMatchObject({ effort: null, completion: "self_report", target: "tab" });
  });

  test("keeps three tasks, active opportunity first, and shows no fake duration", () => {
    const view = buildTodayView({
      opportunities: [
        opportunity({ id: "other", company: "另一家", actions: [{ id: "b", title: "其他岗位任务", reason: "x", dueLabel: "今天", priority: "urgent", status: "todo" }] }),
        opportunity({
          id: "opp-1",
          actions: [
            { id: "a1", title: "当前岗位一", reason: "x", dueLabel: "今天", priority: "normal", status: "todo" },
            { id: "a2", title: "当前岗位二", reason: "x", dueLabel: "本周", priority: "normal", status: "todo" },
            { id: "a3", title: "当前岗位三", reason: "x", dueLabel: "本周", priority: "normal", status: "todo" },
          ],
        }),
      ],
      activeId: "opp-1",
      now: NOW,
      timeZone: "Asia/Shanghai",
    });
    expect(view.tasks.map((task) => task.title)).toEqual(["当前岗位一", "当前岗位二", "当前岗位三"]);
    expect(view.tasks.every((task) => task.effort === null)).toBe(true);
  });

  test("connects the latest confirmed artifact, never a done click", () => {
    const view = buildTodayView({
      opportunities: [opportunity({
        actions: [{ id: "a1", title: "继续下一件事", reason: "x", dueLabel: "今天", priority: "urgent", status: "todo" }],
        snapshots: [{ id: "s1", snapshotType: "submitted_resume", version: 2, title: "投递版简历", frozenAt: "2026-10-23T03:00:00.000Z" }],
      })],
      activeId: "opp-1",
      now: NOW,
      timeZone: "Asia/Shanghai",
    });
    expect(view.mentorLine).toContain("投递版简历");
    expect(view.mentorLine).toContain("继续下一件事");
    expect(view.weekly.map((item) => item.title)).toEqual(["投递版简历"]);
  });

  test("all tasks snoozed yields an explicit no-new-task day", () => {
    const view = buildTodayView({
      opportunities: [opportunity({
        actions: [{ id: "a1", title: "稍后任务", reason: "x", dueLabel: "今天", priority: "urgent", status: "todo" }],
        mentorSnoozes: [{ actionId: "opp-1:a1", until: "2026-10-26T00:00:00.000Z" }],
      })],
      activeId: "opp-1",
      now: NOW,
      timeZone: "Asia/Shanghai",
    });
    expect(view.tasks).toHaveLength(0);
    expect(view.emptyLine).toContain("不用新增任务");
  });

  test("a companion goal keeps Today useful without any job record", () => {
    const view = buildTodayView({
      opportunities: [],
      now: NOW,
      timeZone: "Asia/Shanghai",
      companion: { goalTitle: "转 AI 产品经理", stepTitle: "写一个具体问题", effort: "每周 5 小时", weeklyHours: "每周 5 小时", deadline: null, action: "in_progress" },
    });
    expect(view.goalTitle).toBe("转 AI 产品经理");
    expect(view.tasks).toHaveLength(1);
    expect(view.tasks[0]).toMatchObject({ title: "写一个具体问题", effort: "每周 5 小时", target: "arrangement" });
    expect(view.mentorLine).toContain("转 AI 产品经理");
    expect(view.mentorLine).toContain("写一个具体问题");
    expect(view.emptyLine).toBeNull();
  });

  test("an ended companion goal does not resurrect a task", () => {
    const view = buildTodayView({
      opportunities: [],
      now: NOW,
      timeZone: "Asia/Shanghai",
      companion: { goalTitle: "转 AI 产品经理", stepTitle: "写一个具体问题", effort: "每周 5 小时", weeklyHours: null, deadline: null, action: "ended" },
    });
    expect(view.tasks).toHaveLength(0);
    expect(view.emptyLine).toContain("不用新增任务");
  });
});
