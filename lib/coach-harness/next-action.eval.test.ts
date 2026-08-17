import { demoOpportunities } from "@/lib/opportunities/demo";
import type { Opportunity } from "@/lib/opportunities/types";
import { planMentorActions, type MentorNextAction } from "./next-action";

function makeOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    ...demoOpportunities[0],
    id: "eval-opportunity",
    company: "评测公司",
    role: "AI 产品经理",
    stage: "captured",
    actions: [],
    requirements: [],
    activities: [],
    resumeChanges: [],
    interviewFocus: [],
    ...overrides,
  };
}

type EvalExpectation = Partial<Pick<MentorNextAction, "actionType" | "tab" | "cost" | "source" | "sourceActionId" | "title">>;
type EvalScenario = {
  name: string;
  build: (now: Date) => Opportunity[];
  expected?: EvalExpectation;
  expectedLength?: number;
};

const todo = (id: string, title: string, priority: "urgent" | "high" | "normal" = "high", dueLabel = "今天") => ({
  id, title, reason: "评测原因", dueLabel, priority, status: "todo" as const,
});
const critical = (strength: "missing" | "unverified") => ({
  id: `critical-${strength}`, requirement: "关键结果指标", importance: "critical" as const,
  strength, evidence: "待补充", source: null, verified: false,
});

const scenarios: EvalScenario[] = [
  { name: "空用户从任意材料开始", build: () => [], expected: { actionType: "onboarding", cost: "free" } },
  { name: "准备期先明确岗位方向", build: () => [makeOpportunity({ workspaceType: "preparation", role: "目标待确认" })], expected: { title: "先明确一个目标岗位方向", cost: "free" } },
  { name: "准备期没有简历先补材料", build: () => [makeOpportunity({ workspaceType: "preparation", role: "AI 产品经理", resumeText: "" })], expected: { tab: "resume", cost: "free" } },
  { name: "准备期有简历先拆事实", build: () => [makeOpportunity({ workspaceType: "preparation", role: "AI 产品经理", resumeText: "真实简历" })], expected: { tab: "evidence", actionType: "project_deep_dive" } },

  { name: "关键缺口先于岗位结论", build: () => [makeOpportunity({ requirements: [critical("missing")] })], expected: { source: "evidence_gap", tab: "evidence" } },
  { name: "刚收录岗位先做投递判断", build: () => [makeOpportunity()], expected: { actionType: "job_decision", tab: "overview" } },
  { name: "确认事实归入证据任务", build: () => [makeOpportunity({ actions: [todo("confirm", "确认商业化指标")] })], expected: { actionType: "job_decision", tab: "evidence" } },
  { name: "项目故事归入项目深挖", build: () => [makeOpportunity({ actions: [todo("project", "整理项目故事")] })], expected: { actionType: "project_deep_dive", tab: "evidence" } },

  { name: "简历任务明示消耗额度", build: () => [makeOpportunity({ actions: [todo("resume", "生成岗位简历版本")] })], expected: { actionType: "resume_workshop", tab: "resume", cost: "credits" } },
  { name: "网申任务保持免费", build: () => [makeOpportunity({ actions: [todo("apply", "完成网申表")] })], expected: { actionType: "application_assist", tab: "overview", cost: "free" } },
  { name: "已投递但无任务则主动跟进", build: () => [makeOpportunity({ stage: "applied" })], expected: { actionType: "follow_up", tab: "activity", cost: "free" } },
  { name: "紧急简历任务优先普通判断", build: () => [makeOpportunity({ actions: [todo("decision", "确认岗位", "normal", "本周"), todo("resume-urgent", "修改简历", "urgent", "今天")] })], expected: { sourceActionId: "resume-urgent", actionType: "resume_workshop" } },

  { name: "临近面试主动模拟", build: (now) => [makeOpportunity({ stage: "interviewing", scheduledInterviewAt: new Date(now.getTime() + 6 * 3_600_000).toISOString() })], expected: { actionType: "mock_interview", tab: "interview", cost: "credits" } },
  { name: "面试前缺关键事实先补证据", build: (now) => [makeOpportunity({ stage: "interviewing", scheduledInterviewAt: new Date(now.getTime() + 6 * 3_600_000).toISOString(), requirements: [critical("missing")] })], expected: { source: "evidence_gap", tab: "evidence", cost: "free" } },
  { name: "面试前待确认事实不能进入模拟", build: (now) => [makeOpportunity({ stage: "interviewing", scheduledInterviewAt: new Date(now.getTime() + 24 * 3_600_000).toISOString(), requirements: [critical("unverified")] })], expected: { source: "evidence_gap", actionType: "job_decision" } },
  { name: "面试结束后立即复盘", build: (now) => [makeOpportunity({ stage: "interviewing", scheduledInterviewAt: new Date(now.getTime() - 30 * 60_000).toISOString() })], expected: { actionType: "interview_review", tab: "review", title: "先复盘刚结束的面试" } },

  { name: "显式复盘任务正确分类", build: () => [makeOpportunity({ actions: [todo("review", "复盘今天的一面")] })], expected: { actionType: "interview_review", tab: "review" } },
  { name: "显式跟进任务正确分类", build: () => [makeOpportunity({ actions: [todo("follow", "给 HR 发跟进")] })], expected: { actionType: "follow_up", tab: "activity" } },
  { name: "终态岗位即使残留任务也不打扰", build: () => [makeOpportunity({ stage: "lost", actions: [todo("stale", "修改简历", "urgent")] })], expectedLength: 0 },
  { name: "已完成和暂停任务不会被重新执行", build: () => [makeOpportunity({ actions: [{ ...todo("done", "修改简历"), status: "done" }, { ...todo("snoozed", "练习面试"), status: "snoozed" }] })], expected: { source: "system", actionType: "job_decision" } },
];

const contexts = [
  ["春招", "2026-03-02T02:00:00.000Z", "春招公司", "AI 产品经理"],
  ["暑期", "2026-06-18T08:00:00.000Z", "暑期公司", "产品经理"],
  ["秋招", "2026-09-05T01:00:00.000Z", "秋招公司", "大模型产品经理"],
  ["海外", "2026-11-12T16:00:00.000Z", "海外团队", "Technical PM"],
  ["社招", "2027-01-20T04:00:00.000Z", "社招公司", "高级产品经理"],
] as const;

describe("mentor next-action 100-case evaluation", () => {
  const cases = scenarios.flatMap((scenario) => contexts.map(([context, iso, company, role], index) => ({ scenario, context, iso, company, role, index })));

  test("contains 100 deterministic cases across five job-search paths", () => {
    expect(cases).toHaveLength(100);
  });

  test.each(cases)("$context / $scenario.name", ({ scenario, iso, company, role, index }) => {
    const now = new Date(iso);
    const opportunities = scenario.build(now).map((item) => ({ ...item, id: `${item.id}-${index}`, company, role: item.role === "目标待确认" ? item.role : role }));
    const result = planMentorActions(opportunities, now);
    if (scenario.expectedLength !== undefined) {
      expect(result).toHaveLength(scenario.expectedLength);
      return;
    }
    expect(result[0]).toMatchObject(scenario.expected || {});
  });
});
