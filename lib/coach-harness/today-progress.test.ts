import type { Opportunity } from "@/lib/opportunities/types";
import { civilDateKey, collectConfirmedProgress, latestConfirmedProgress, weekRange, weeklyConfirmedProgress } from "./today-progress";

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

describe("today progress", () => {
  test("uses the user's civil date instead of the server date", () => {
    expect(civilDateKey("2026-10-24T16:30:00.000Z", "Asia/Shanghai")).toBe("2026-10-25");
    expect(civilDateKey("2026-10-24T16:30:00.000Z", "UTC")).toBe("2026-10-24");
  });

  test("week starts on Monday in the user's calendar", () => {
    expect(weekRange(new Date("2026-10-24T12:00:00.000Z"), "Asia/Shanghai")).toMatchObject({
      startKey: "2026-10-19",
      endKey: "2026-10-25",
    });
    expect(weekRange(new Date("2026-10-19T01:00:00+08:00"), "Asia/Shanghai").startKey).toBe("2026-10-19");
  });

  test("counts only frozen artifacts, completed rounds and saved reports", () => {
    const items = collectConfirmedProgress([
      opportunity({
        actions: [{ id: "todo", title: "改简历", reason: "准备投递", dueLabel: "今天", priority: "urgent", status: "done" }],
        activities: [{ id: "act", actor: "user", title: "点了完成", detail: "", timeLabel: "今天" }],
        snapshots: [{ id: "snap", snapshotType: "submitted_resume", version: 2, title: "投递版简历", frozenAt: "2026-10-24T02:00:00.000Z" }],
        mockInterviews: [
          { id: "done", round: "一面", status: "completed", currentIndex: 3, turns: [], createdAt: "2026-10-23T02:00:00.000Z", summary: { overallScore: 82, grade: "稳健", strengths: [], weaknesses: [], suggestions: [] } },
          { id: "running", round: "二面", status: "running", currentIndex: 1, turns: [], createdAt: "2026-10-24T05:00:00.000Z" },
        ],
        reviewReports: [{ id: "report", round: "一面", grade: "B", overallComment: "", strengths: [], improvements: [], actions: [], sourceNotes: "", createdAt: "2026-10-22T02:00:00.000Z" }],
      }),
    ], "Asia/Shanghai");

    expect(items.map((item) => item.sourceLabel)).toEqual(["投递简历 v2", "模拟面试", "面试复盘报告"]);
    expect(items.map((item) => item.statusLabel)).toEqual(["已冻结", "已完成整轮", "已出报告"]);
    expect(items.every((item) => item.dateKey && item.timeLabel)).toBe(true);
  });

  test("weekly view keeps this user week and excludes older or future artifacts", () => {
    const items = weeklyConfirmedProgress([
      opportunity({
        snapshots: [
          { id: "this-week", snapshotType: "jd", version: 1, title: "岗位 JD", frozenAt: "2026-10-20T03:00:00.000Z" },
          { id: "last-week", snapshotType: "jd", version: 1, title: "旧 JD", frozenAt: "2026-10-12T03:00:00.000Z" },
        ],
      }),
    ], new Date("2026-10-24T12:00:00.000Z"), "Asia/Shanghai");

    expect(items.week.startKey).toBe("2026-10-19");
    expect(items.items.map((entry) => entry.title)).toEqual(["岗位 JD"]);
  });

  test("latest confirmed progress ignores unconfirmed work", () => {
    expect(latestConfirmedProgress([opportunity()], "Asia/Shanghai")).toBeNull();
    expect(latestConfirmedProgress([
      opportunity({ snapshots: [{ id: "s", snapshotType: "base_resume", version: 1, title: "基础简历", frozenAt: "2026-10-20T03:00:00.000Z" }] }),
    ], "Asia/Shanghai")).toMatchObject({ title: "基础简历", tab: "resume" });
  });
});
