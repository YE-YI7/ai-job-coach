import {
  assertDistinctModelFamily,
  assertScoreShipsWithExplanation,
  attachBandedScore,
  BareScoreError,
  buildBandedScore,
  buildRoundScoreWire,
  collectRescores,
  MAX_RESCORE_SPREAD,
  modelFamily,
  RESCORE_RUNS,
  RescoreVarianceError,
  ReviewerFamilyError,
  toScoredAssessmentWirePayload,
  type BandedScore,
} from "./scoring-band";
import type { InterviewAssessment } from "./types";

const baseInput = {
  rescores: [76, 78, 81],
  rubricAnchor: "指标口径题：能给出口径定义+决策依据+复核方式三者为合格线",
  workedExampleRefs: ["example-pass-01", "example-fail-03"],
  evidenceUsed: ["把 DAU 的定义统一成打开首页即计"],
  answeringModel: "deepseek-v4.1-flash",
  reviewerModel: "kimi-k3",
};

const assessed: InterviewAssessment = {
  status: "assessed",
  score: 78,
  summary: "s",
  evidence: ["e"],
  missingEvidence: [],
  dimensions: [],
  rewritePlan: [],
  followUp: "f",
};

const needsMore: InterviewAssessment = {
  status: "needs_more_input",
  score: null,
  summary: "回答信息不足",
  evidence: [],
  missingEvidence: ["无具体事实"],
  dimensions: [],
  rewritePlan: [],
  followUp: "补充细节？",
};

describe("D3 异族评审模型", () => {
  test("modelFamily 与仓内约定一致：厂商前缀", () => {
    expect(modelFamily("deepseek-v4.1-flash")).toBe("deepseek");
    expect(modelFamily("kimi-k3")).toBe("kimi");
  });

  test("同族评审（deepseek 答 deepseek 评）直接拒绝", () => {
    expect(() => assertDistinctModelFamily({ answeringModel: "deepseek-v4.1-flash", reviewerModel: "deepseek-v4-pro" }))
      .toThrow(ReviewerFamilyError);
  });

  test("模型缺失也拒绝——不能默认放行", () => {
    expect(() => assertDistinctModelFamily({ answeringModel: "", reviewerModel: "kimi-k3" })).toThrow(ReviewerFamilyError);
  });
});

describe("FR-28 方差带组装", () => {
  test("同一答案重跑 3 次：极差在声明阈值内，取中位数出分", () => {
    const score = buildBandedScore(baseInput);
    expect(score.value).toBe(78);
    expect(score.band).toEqual({ minus: 2, plus: 3, label: "±3" });
    expect(score.derivation.spread).toBe(5);
    expect(score.derivation.spread).toBeLessThanOrEqual(MAX_RESCORE_SPREAD);
    expect(score.derivation.rescores).toEqual([76, 78, 81]);
    expect(score.derivation.explanation).toContain("中位数 78");
    expect(score.derivation.explanation).toContain("kimi");
    expect(score.derivation.explanation).toContain("deepseek");
  });

  test("重跑极差超过阈值：分数不可信，拒发而不是发裸分", () => {
    expect(() => buildBandedScore({ ...baseInput, rescores: [60, 85, 72] })).toThrow(RescoreVarianceError);
  });

  test("重跑次数不足 3 次不发分", () => {
    expect(() => buildBandedScore({ ...baseInput, rescores: [76, 78] })).toThrow(BareScoreError);
    expect(RESCORE_RUNS).toBe(3);
  });

  test("缺 rubric 锚点 / 缺样例 / 未引用回答原文，都不出分", () => {
    expect(() => buildBandedScore({ ...baseInput, rubricAnchor: " " })).toThrow(BareScoreError);
    expect(() => buildBandedScore({ ...baseInput, workedExampleRefs: [] })).toThrow(BareScoreError);
    expect(() => buildBandedScore({ ...baseInput, evidenceUsed: [] })).toThrow(BareScoreError);
  });

  test("collectRescores 逐次调用注入的评分器，失败不静默补数", async () => {
    const queue = [77, 78, 77];
    let calls = 0;
    const rescores = await collectRescores(async () => {
      const value = queue[calls];
      calls += 1;
      return value;
    });
    expect(calls).toBe(3);
    expect(rescores).toEqual([77, 78, 77]);
    await expect(collectRescores(async () => Number.NaN)).rejects.toThrow(BareScoreError);
  });
});

describe("裸分数结构性不可能", () => {
  test("裸数字不是分数", () => {
    expect(() => assertScoreShipsWithExplanation(72)).toThrow(/裸数字不是分数/);
    expect(() => assertScoreShipsWithExplanation({ score: 72 })).toThrow(BareScoreError);
  });

  test("有数值没 band 判缺陷", () => {
    const score = buildBandedScore(baseInput) as unknown as Record<string, unknown>;
    delete score.band;
    expect(() => assertScoreShipsWithExplanation(score)).toThrow(/浮动区间/);
  });

  test("有 band 没 derivation（怎么来的）判缺陷", () => {
    const score = buildBandedScore(baseInput) as unknown as Record<string, unknown>;
    delete score.derivation;
    expect(() => assertScoreShipsWithExplanation(score)).toThrow(/推导依据/);
  });

  test("derivation 缺解释 / 缺重跑明细 / 评审同族，都判缺陷", () => {
    const strip = (mutate: (d: Record<string, unknown>) => void) => {
      const score = buildBandedScore(baseInput) as unknown as Record<string, unknown>;
      const derivation = { ...(score.derivation as Record<string, unknown>) };
      mutate(derivation);
      score.derivation = derivation;
      return score;
    };
    expect(() => assertScoreShipsWithExplanation(strip((d) => { d.explanation = ""; }))).toThrow(BareScoreError);
    expect(() => assertScoreShipsWithExplanation(strip((d) => { d.rescores = [76]; }))).toThrow(BareScoreError);
    expect(() => assertScoreShipsWithExplanation(strip((d) => { d.reviewerModel = "glm-5.3"; d.reviewerFamily = "glm"; }))).not.toThrow();
    expect(() => assertScoreShipsWithExplanation(strip((d) => { d.reviewerModel = "deepseek-v4-pro"; }))).toThrow(ReviewerFamilyError);
  });

  test("合法 BandedScore 原样过闸", () => {
    const score = buildBandedScore(baseInput);
    expect(assertScoreShipsWithExplanation(score)).toBe(score as BandedScore);
  });
});

describe("attachBandedScore：评估对象的分数只能是带解释的对象或 null", () => {
  test("assessed + 带区间带依据的分数 = 合法交付", () => {
    const out = attachBandedScore({ ...assessed, score: null }, buildBandedScore(baseInput));
    expect(out.status).toBe("assessed");
    expect(out.score?.band.label).toBe("±3");
    expect(out.score?.derivation.explanation.length).toBeGreaterThan(0);
  });

  test("assessed 状态想留裸数字或不带分数——拒绝", () => {
    expect(() => attachBandedScore(assessed, null)).toThrow(BareScoreError);
  });

  test("needs_more_input 只允许 null，不允许塞分数", () => {
    const out = attachBandedScore(needsMore, null);
    expect(out.score).toBeNull();
    expect(() => attachBandedScore(needsMore, buildBandedScore(baseInput))).toThrow(BareScoreError);
  });
});

describe("对 W6 的出网形状（scoreBand / scoreBandNote 合同）", () => {
  test("assessed 摊平后必带 scoreBand（数字）与 scoreBandNote（依据）", () => {
    const wire = toScoredAssessmentWirePayload(
      attachBandedScore({ ...assessed, score: null }, buildBandedScore(baseInput)),
    );
    expect(wire.score).toBe(78);
    expect(wire.scoreBand).toBe(3);
    expect(wire.scoreBandNote).toContain("中位数 78");
    expect(wire.scoreDerivation?.rescores).toEqual([76, 78, 81]);
  });

  test("needs_more_input 摊平后不携带任何分数字段——不显示分也不显示带", () => {
    const wire = toScoredAssessmentWirePayload(attachBandedScore(needsMore, null));
    expect(wire.score).toBeNull();
    expect(wire.scoreBand).toBeUndefined();
    expect(wire.scoreBandNote).toBeUndefined();
  });

  test("整轮分由逐题带分数确定性聚合：band 取各题最大波动，未评分题如实排除并说明", () => {
    const q1 = buildBandedScore(baseInput); // 78 ±3
    const q2 = buildBandedScore({ ...baseInput, rescores: [84, 85, 86] }); // 85 ±1
    const wire = buildRoundScoreWire([
      { questionId: "q1", score: q1 },
      { questionId: "q2", score: q2 },
      { questionId: "q3", score: null },
    ]);
    expect(wire.overallScore).toBe(82); // (78+85)/2
    expect(wire.overallScoreBand).toBe(3);
    expect(wire.overallScoreBandNote).toContain("q3");
    expect(wire.unscoredQuestionIds).toEqual(["q3"]);
  });

  test("整轮没有任何带依据的单题分数时，不许凭空汇总总分", () => {
    expect(() => buildRoundScoreWire([{ questionId: "q1", score: null }])).toThrow(BareScoreError);
  });
});
