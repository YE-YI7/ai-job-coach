import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import InterviewRoundReview from "./InterviewRoundReview";
import {
  normalizeInterviewAssessment,
  normalizeRoundSummary,
  type RoundtableTurnView,
} from "./interview-assessment-logic";

const summary = normalizeRoundSummary({
  overallScore: 72,
  grade: "B",
  verdict: "能说明判断，验证证据还需要补齐。",
  strengths: ["保留原始证据"],
  weaknesses: ["缺少对照基线"],
  dimensions: [{ name: "判断", score: 72, comment: "已有问题与决策。" }],
  questionBreakdown: [
    { questionId: "q1", score: 72, decisiveFinding: "需要交代对照基线" },
  ],
  nextActions: [
    {
      title: "补齐基线",
      reason: "回答中尚未说明",
      doneWhen: "能讲清前后口径",
      priority: "high",
    },
  ],
})!;
const turns: RoundtableTurnView[] = [
  {
    questionId: "q1",
    question: "如何确定验证基线？",
    answer: "我先核对了灰度前的失败记录，再固定对照样本。",
    assessment: normalizeInterviewAssessment({
      status: "assessed",
      score: 72,
      summary: "已说明判断，仍缺基线口径",
      evidence: ["核对了灰度前的失败记录"],
      missingEvidence: ["缺少对照基线"],
      rewritePlan: ["先说口径"],
      followUp: "灰度样本如何选？",
    })!,
  },
  {
    questionId: "q2",
    question: "介绍协作方式",
    answer: "[已跳过，未评分] 本轮跳过",
    skipped: true,
  },
  {
    questionId: "q3",
    question: "如何检查回归？",
    answer: "我保留未通过的回归样本。",
  },
];
const props = {
  summary,
  turns,
  round: "二面",
  createdAt: "2026-10-30T08:00:00Z",
  example: true,
  onRestart: jest.fn(),
  onBack: jest.fn(),
  onOpenHistory: jest.fn(),
};

test("真实作答为唯一计数依据，跳过标记不伪装成回答；评价只来自已给数据", () => {
  const html = renderToStaticMarkup(<InterviewRoundReview {...props} />);
  expect(html).toMatch(/你答了 <em>2<\/em>/);
  expect(html).toContain("第2题，跳过");
  expect(html).toContain("72");
  expect(html).toContain("波动未实测");
  expect(html).toContain("示例工作区");
  expect(html).not.toContain("早鸟计划");
});

test("没有回答时不把跳过或旧反馈当回答，原始输入不被改写", () => {
  const copy = JSON.stringify(turns);
  const html = renderToStaticMarkup(
    <InterviewRoundReview {...props} turns={[turns[1]]} />,
  );
  expect(html).toContain("还没留下回答");
  expect(html).toContain("已跳过");
  expect(JSON.stringify(turns)).toBe(copy);
});

test("不硬填维度、下一步或用户复盘；缺失的内容不生成占位结论", () => {
  const minimal = {
    ...summary,
    dimensions: [],
    nextActions: [],
    strengths: [],
    weaknesses: [],
    questionBreakdown: [],
  };
  const html = renderToStaticMarkup(
    <InterviewRoundReview {...props} summary={minimal} turns={[]} />,
  );
  expect(html).not.toContain("下一场先做");
  expect(html).not.toContain("本轮评价");
  expect(html).not.toContain("你自己先写的复盘");
});

test("原话以安全文本呈现，不把用户材料作为HTML执行", () => {
  const html = renderToStaticMarkup(
    <InterviewRoundReview
      {...props}
      turns={[
        {
          questionId: "safe",
          question: "<script>unsafe</script>",
          answer: "<img src=x onerror=unsafe>",
        },
      ]}
    />,
  );
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img src=x");
});

test("搜索改变可见题目，返回、重练与历史均复用调用方动作，不发模型请求", () => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<InterviewRoundReview {...props} />);
  });
  act(() =>
    tree.root
      .findByProps({ "aria-label": "搜索本轮问题或回答" })
      .props.onChange({ target: { value: "协作" } }),
  );
  expect(
    tree.root.findAll(
      (node) =>
        node.type === "article" &&
        String(node.props.id).startsWith("round-review-"),
    ),
  ).toHaveLength(1);
  for (const callback of [props.onBack, props.onRestart, props.onOpenHistory]) {
    const button = tree.root
      .findAllByType("button")
      .find((node) => node.props.onClick === callback)!;
    act(() => button.props.onClick());
    expect(callback).toHaveBeenCalled();
  }
  act(() => tree.unmount());
});
