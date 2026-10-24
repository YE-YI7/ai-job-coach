import { decideCompanion, reviewSubmission, type CompanionTask } from "./companion-arrangement";

const base = (text: string): CompanionTask => {
  const decision = decideCompanion(text);
  return { goalKey: "k", goalTitle: decision.goalTitle, sourceText: text, weeklyHours: decision.weeklyHours, deadline: decision.deadline, answer: decision.answer, question: decision.question, step: decision.step, stages: decision.stages, route: decision.route, action: "not_started", submissions: [] };
};

test("C01 keeps the transfer goal and does not assign Python or lesson one", () => {
  const decision = decideCompanion("做了几年其他工作，想转AI产品经理，不知从哪开始，要不要先学Python");
  expect(decision.goalTitle).toBe("转 AI 产品经理");
  expect(decision.answer).toContain("不必先学 Python");
  expect(decision.step?.title).not.toContain("第一课");
  expect(decision.step?.deliverable).toBeTruthy();
});

test("C02 changes effort from the weekend constraint and does not invent a deadline", () => {
  const first = base("想转AI产品经理");
  const next = decideCompanion("只有周末，每周3小时；还没有项目", first);
  expect(next.weeklyHours).toBe("每周 3 小时");
  expect(next.deadline).toBeNull();
  expect(next.step?.effort).toContain("每周 3 小时");
});

test("C03 through C12 stay inside the stated route", () => {
  expect(decideCompanion("想做个AI效率工具").question).toContain("谁在做");
  expect(decideCompanion("同事每周手动汇总三张表，字段不一致").answer).toContain("三张表");
  expect(decideCompanion("我不知道适合什么，先帮我判断").answer).not.toMatch(/\d+\s*分/);
  expect(decideCompanion("明天下午面试，只想练项目追问").route).toBe("interview");
  expect(decideCompanion("只改这段实习里的表达").route).toBe("resume");
  expect(decideCompanion("只是问为什么这样写，不要改简历").route).toBe("discuss");
  expect(decideCompanion("先到这里").route).toBe("end");
  const link = decideCompanion("https://example.com/demo");
  expect(link.readSubmission).toBe(false);
  expect(link.answer).toContain("没有打开");
  expect(reviewSubmission(base("想转AI产品经理"), "同事每周手动汇总三张表")).toContain("三张表");
});

test("unseen wording keeps the stated goal, the missing experience, and an interview request", () => {
  expect(decideCompanion("我想转行做财务分析师").goalTitle).not.toBe("转 AI 产品经理");
  expect(decideCompanion("别给我定成AI产品经理，我要转数据分析").goalTitle).not.toBe("转 AI 产品经理");
  const student = decideCompanion("应届，没有任何实习");
  expect(`${student.answer}\n${student.step?.why}`).not.toContain("你已有工作经历");
  const changed = decideCompanion("我要转金融", base("想转AI产品经理"));
  expect(changed.goalTitle).not.toBe("转 AI 产品经理");
  expect(decideCompanion("这周五要面试，想练一下追问").route).toBe("interview");
});

test("a project intended for an interviewer does not start an interview now", () => {
  const decision = decideCompanion("我想转AI产品经理，每周6小时，希望8周后有一个能拿给面试官看的真实练习项目，不知道从哪开始");
  expect(decision.route).toBe("arrange");
  expect(decision.step).not.toBeNull();
});

test("stated target and effort are kept from the real acceptance phrasing", () => {
  const decision = decideCompanion("我做了4年线下运营，目标转行AI产品经理，每周能投入6小时，希望8周后有一个能拿给面试官看的真实练习项目");
  expect(decision.goalTitle).toBe("转 AI 产品经理");
  expect(decision.weeklyHours).toBe("每周 6 小时");
  expect(decision.deadline).toBe("8周后");
  expect(decision.route).toBe("arrange");
});
