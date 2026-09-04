/**
 * 面试前端展示层单元测试。
 *
 * 重点锁死一条线：任何形式的"模型没给出可信结论"都必须走 needs_more_input 或 null，
 * 绝不能被渲染成一个分数。
 */

import {
  needsMoreInputHints,
  normalizeInterviewAssessment,
  normalizeRoundSummary,
  resolveNextStep,
  toOpportunityActions,
} from "./interview-assessment-logic";

describe("normalizeInterviewAssessment", () => {
  it("低信息回答：score 强制为 null，保留补充提示", () => {
    const view = normalizeInterviewAssessment({
      status: "needs_more_input",
      score: null,
      summary: "回答过短，缺少足够信息进行评估。",
      evidence: [],
      missingEvidence: ["回答中未提供具体事实或经历"],
      dimensions: [],
      rewritePlan: ["请补充更多细节，比如你的角色、行动和结果"],
      followUp: "能否展开说明你的具体做法、决策和结果？",
    });

    expect(view).not.toBeNull();
    expect(view!.status).toBe("needs_more_input");
    expect(view!.score).toBeNull();
    expect(view!.summary).not.toMatch(/基本可用|较差|优秀/);
    expect(needsMoreInputHints(view!)).toContain("回答中未提供具体事实或经历");
  });

  it("后端误传分数但标记 needs_more_input：仍然不显示分数", () => {
    const view = normalizeInterviewAssessment({ status: "needs_more_input", score: 72, summary: "信息不足，暂不评分。", evidence: ["看起来有内容"] });
    expect(view!.status).toBe("needs_more_input");
    expect(view!.score).toBeNull();
  });

  it("assessed 但没有证据：降级为 needs_more_input", () => {
    const view = normalizeInterviewAssessment({ status: "assessed", score: 88, summary: "回答不错", evidence: [] });
    expect(view!.status).toBe("needs_more_input");
    expect(view!.score).toBeNull();
  });

  it("assessed 但没有分数：降级为 needs_more_input", () => {
    const view = normalizeInterviewAssessment({ status: "assessed", score: null, summary: "回答不错", evidence: ["用户提到了召回策略"] });
    expect(view!.status).toBe("needs_more_input");
    expect(view!.score).toBeNull();
  });

  it("assessed 且有证据：保留分数与全部字段", () => {
    const view = normalizeInterviewAssessment({
      status: "assessed",
      score: 76.4,
      summary: "结论先行，但数字口径没说清。",
      evidence: ["你提到转化率提升，但没说明基线"],
      missingEvidence: ["缺少时间窗口与归因方式"],
      dimensions: [{ name: "逻辑性", score: 80, comment: "结论先行" }, { name: "重答建议", comment: "先写目标" }],
      rewritePlan: ["先写目标与核心指标", "说明分子分母"],
      followUp: "你说的提升，基线是什么？",
    });

    expect(view!.status).toBe("assessed");
    expect(view!.score).toBe(76);
    expect(view!.evidence).toHaveLength(1);
    expect(view!.missingEvidence).toEqual(["缺少时间窗口与归因方式"]);
    expect(view!.dimensions).toHaveLength(2);
    expect(view!.dimensions[1].score).toBeUndefined();
    expect(view!.rewritePlan).toHaveLength(2);
  });

  it("噪声分数被夹到 0-100，非数字分数降级", () => {
    expect(normalizeInterviewAssessment({ status: "assessed", score: 140, evidence: ["x"] })!.score).toBe(100);
    expect(normalizeInterviewAssessment({ status: "assessed", score: -20, evidence: ["x"] })!.score).toBe(0);
    expect(normalizeInterviewAssessment({ status: "assessed", score: "70", evidence: ["x"] })!.status).toBe("needs_more_input");
  });

  it.each([null, undefined, "", 42, [], {}])("不可用的响应返回 null：%p", (raw) => {
    expect(normalizeInterviewAssessment(raw)).toBeNull();
  });

  it("来源标记：demo 反馈可被识别，不会被当成真实模型输出", () => {
    expect(normalizeInterviewAssessment({ status: "assessed", score: 60, evidence: ["演示"] }, "demo")!.source).toBe("demo");
    expect(normalizeInterviewAssessment({ status: "assessed", score: 60, evidence: ["真跑"] })!.source).toBe("llm");
  });

  it("空字符串证据不计数，避免空数组伪装成有证据", () => {
    expect(normalizeInterviewAssessment({ status: "assessed", score: 60, evidence: ["", "  "] })!.status).toBe("needs_more_input");
  });
});

describe("resolveNextStep", () => {
  it("needs_more_input 停在原题", () => {
    expect(resolveNextStep(1, 3, "needs_more_input")).toEqual({ currentIndex: 1, completed: false });
  });

  it("assessed 才推进题号", () => {
    expect(resolveNextStep(0, 3, "assessed")).toEqual({ currentIndex: 1, completed: false });
  });

  it("最后一题 assessed 才标记完成", () => {
    expect(resolveNextStep(2, 3, "assessed")).toEqual({ currentIndex: 2, completed: true });
    expect(resolveNextStep(2, 3, "needs_more_input")).toEqual({ currentIndex: 2, completed: false });
  });
});

describe("normalizeRoundSummary", () => {
  const validSummary = {
    overallScore: 72,
    grade: "B+",
    verdict: "结构清晰，但数字口径要补。",
    strengths: ["结论先行"],
    weaknesses: ["口径不清"],
    dimensions: [{ name: "专业深度", score: 70, comment: "能讲清机制" }],
    questionBreakdown: [{ questionId: "q1", score: 68, decisiveFinding: "排序环节跳步" }],
    nextActions: [
      { title: "补齐转化率口径", reason: "两题口径不一致", doneWhen: "能说出基线与时间窗", priority: "urgent" },
      { title: "重答项目挑战题", reason: "责任边界模糊", doneWhen: "能说清个人决策", priority: "high" },
      { title: "准备反问", reason: "没准备", doneWhen: "写出 3 个反问", priority: "normal" },
      { title: "第四个不该出现", reason: "超过上限", doneWhen: "—", priority: "normal" },
    ],
  };

  it("正常总结：保留 7 维以内的维度与逐题决定性发现", () => {
    const view = normalizeRoundSummary(validSummary);
    expect(view!.overallScore).toBe(72);
    expect(view!.grade).toBe("B+");
    expect(view!.dimensions).toHaveLength(1);
    expect(view!.questionBreakdown[0].decisiveFinding).toBe("排序环节跳步");
  });

  it("下一步最多 3 个", () => {
    expect(normalizeRoundSummary(validSummary)!.nextActions).toHaveLength(3);
  });

  it("缺 overallScore 或缺 grade 返回 null，不展示半份报告", () => {
    expect(normalizeRoundSummary({ ...validSummary, overallScore: undefined })).toBeNull();
    expect(normalizeRoundSummary({ ...validSummary, grade: "" })).toBeNull();
    expect(normalizeRoundSummary({ ...validSummary, overallScore: null })).toBeNull();
  });

  it("维度分缺失时不用总分兜底", () => {
    const view = normalizeRoundSummary({ ...validSummary, dimensions: [{ name: "应变能力", score: null, comment: "被追问后重复同一答案" }] });
    expect(view!.dimensions[0].score).toBe(0);
  });

  it.each([null, undefined, "", 7, []])("不可用的总结响应返回 null：%p", (raw) => {
    expect(normalizeRoundSummary(raw)).toBeNull();
  });
});

describe("toOpportunityActions", () => {
  const nextActionsOf = (raw: unknown) => normalizeRoundSummary({
    overallScore: 72,
    grade: "B+",
    verdict: "结构清晰，但数字口径要补。",
    nextActions: raw,
  })!.nextActions;

  it("整轮下一步进入作战板，最多 3 个且带完成标准", () => {
    const actions = toOpportunityActions("session-1", nextActionsOf([
        { title: "补齐转化率口径", reason: "两题口径不一致", doneWhen: "能说出基线与时间窗", priority: "urgent" },
        { title: "重答项目挑战题", reason: "责任边界模糊", doneWhen: "能说清个人决策", priority: "high" },
        { title: "准备反问", reason: "没准备", doneWhen: "写出 3 个反问", priority: "normal" },
        { title: "第四个不该出现", reason: "超过上限", doneWhen: "—", priority: "normal" },
      ]));

    expect(actions).toHaveLength(3);
    expect(actions[0].id).toBe("interview-next-session-1-补齐转化率口径");
    expect(actions[0].status).toBe("todo");
    expect(actions[0].priority).toBe("urgent");
    // dueLabel 用 doneWhen，和服务端写入 metadata.actions 的口径一致
    expect(actions[0].dueLabel).toBe("能说出基线与时间窗");
    expect(actions[0].reason).toBe("两题口径不一致");
  });

  it("id 与后端 complete 路由一致，刷新后不会与服务端那份重复", () => {
    const actions = nextActionsOf([{ title: "补齐口径", reason: "r", doneWhen: "d", priority: "high" }]);
    expect(toOpportunityActions("session-9", actions)[0].id).toBe("interview-next-session-9-补齐口径");
  });

  it("id 稳定，重复同步不会产生重复行动项", () => {
    const actions = nextActionsOf([{ title: "补齐口径", reason: "r", doneWhen: "d", priority: "high" }]);
    const first = toOpportunityActions("session-9", actions);
    const second = toOpportunityActions("session-9", actions);
    expect(second.map((action) => action.id)).toEqual(first.map((action) => action.id));
  });
});
