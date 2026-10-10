import { interviewMode, interviewSystem, renderInterview } from "./interaction-contract";
test("明确模拟进入面试官，保持回合并允许退出到教学", () => {
  expect(interviewMode("扮演面试官，每次只问一个问题")).toBe(true);
  expect(interviewMode("SQL分析节点耗时", "mock_interview")).toBe(true);
  expect(interviewMode("教我这个问题", "mock_interview")).toBe(false);
  expect(interviewMode("帮我准备面试")).toBe(false);
});
test("首轮只有一题，不泄露评价和示例", () => {
  expect(renderInterview(JSON.stringify({question:"审批流改版中，你首先识别的业务问题是什么？"}), true)).toBe("审批流改版中，你首先识别的业务问题是什么？");
  for (const data of [{question:"问题是什么？你做了什么？"}, {question:"问题是什么？", feedback:"很好"}, {question:"参考答案：完成率提升，你怎么做？"}]) expect(() => renderInterview(JSON.stringify(data), true)).toThrow();
  expect(interviewSystem(true)).toContain("不提供框架");
});
test("回答后必须反馈和一条追问，不能偷偷加第二题", () => {
  expect(renderInterview(JSON.stringify({feedback:"你明确区分了个人职责与团队结果。",question:"你怎样验证权限是主要摩擦？"}),false)).toContain("本题反馈");
  expect(() => renderInterview(JSON.stringify({feedback:"你为什么这样做？",question:"为什么？"}),false)).toThrow();
});
