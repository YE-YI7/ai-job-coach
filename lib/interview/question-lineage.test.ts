import {
  checkQuestionSourcing,
  checkSessionLinkage,
  checkSessionSourcing,
  isPairLinked,
  LINKAGE_MAX_UNLINKED_RATIO,
  normalizeForQuotation,
  type ConsecutiveRoundPair,
  type QuestionLinkage,
} from "./question-lineage";

const validLinkage: QuestionLinkage = {
  kind: "linked",
  previousQuestionId: "q1",
  tookFrom: ["负责过指标口径的梳理"],
  linkage: "drill_missing_evidence",
  carriesForward: "上一答只说了梳理口径，没说什么指标、怎么定的——追问口径决策依据",
};

const previousAnswer = "我在上一家公司负责过指标口径的梳理，把 DAU 的定义统一成打开首页即计。";

describe("FR-27 来源标注检查", () => {
  test("两个不同来源且指针可追溯 = 合规", () => {
    expect(
      checkQuestionSourcing([
        { source: "resume", pointer: "负责增长产品" },
        { source: "knowledge", pointer: "experiment-and-metric-diagnosis" },
      ]),
    ).toEqual([]);
  });

  test("完全没有来源标注判负", () => {
    expect(checkQuestionSourcing(undefined).length).toBe(1);
    expect(checkQuestionSourcing([])[0]).toContain("没有任何来源标注");
  });

  test("仅由 JD 成立的单源题判负", () => {
    const reasons = checkQuestionSourcing([{ source: "jd", pointer: "负责增长" }]);
    expect(reasons.join("\n")).toContain("单源题");
    expect(reasons.join("\n")).toContain("禁止围着 JD 出题");
  });

  test("来源类型不在四源之内判负", () => {
    expect(checkQuestionSourcing([{ source: "gut_feeling", pointer: "x" }, { source: "jd", pointer: "y" }])[0]).toContain("四源");
  });

  test("来源有类型没指针，视同无来源", () => {
    expect(checkQuestionSourcing([{ source: "resume", pointer: "  " }, { source: "jd", pointer: "y" }])[0]).toContain("可追溯指针");
  });

  test("会话级：逐题多源即合规", () => {
    const report = checkSessionSourcing([
      { id: "a", sources: [{ source: "jd", pointer: "p" }, { source: "resume", pointer: "r" }] },
      { id: "b", sources: [{ source: "research", pointer: "x" }, { source: "knowledge", pointer: "k" }] },
    ]);
    expect(report.ok).toBe(true);
    expect(report.sessionSourceUnion).toEqual(expect.arrayContaining(["jd", "resume", "research", "knowledge"]));
  });

  test("会话级：任一题单源即整轮判负", () => {
    const report = checkSessionSourcing([
      { id: "a", sources: [{ source: "jd", pointer: "p" }, { source: "resume", pointer: "r" }] },
      { id: "b", sources: [{ source: "jd", pointer: "q" }] },
    ]);
    expect(report.ok).toBe(false);
    expect(report.violations.some((v) => v.questionId === "b" && v.reasons.join("").includes("单源题"))).toBe(true);
  });

  test("normalizeForQuotation 只去空白不改字——承接必须是原文引用", () => {
    expect(normalizeForQuotation("我 负责\n指标　口径")).toBe("我负责指标口径");
  });
});

describe("FR-26 单对承接核验（确定性，不走模型）", () => {
  test("tookFrom 片段逐字命中上一答 = 已承接", () => {
    expect(isPairLinked(validLinkage, previousAnswer).state).toBe("linked");
  });

  test("片段与原文只差空白也算命中（归一化比对）", () => {
    const linkage: QuestionLinkage = { ...validLinkage, tookFrom: ["负责过 指标口径\n的梳理"] };
    expect(isPairLinked(linkage, previousAnswer).state).toBe("linked");
  });

  test("编造的承接片段判未承接", () => {
    const linkage: QuestionLinkage = { ...validLinkage, tookFrom: ["我主导了一亿人规模的改版"] };
    const result = isPairLinked(linkage, previousAnswer);
    expect(result.state).toBe("unlinked");
    expect(result.reasons.join("")).toContain("编造承接");
  });

  test("没有承接结构 / tookFrom 为空 / 缺 carriesForward 都判未承接", () => {
    expect(isPairLinked(undefined, previousAnswer).state).toBe("unlinked");
    expect(isPairLinked({ ...validLinkage, tookFrom: [] }, previousAnswer).reasons.join("")).toContain("tookFrom 为空");
    expect(isPairLinked({ ...validLinkage, carriesForward: "" }, previousAnswer).reasons.join("")).toContain("carriesForward");
  });

  test("非首题标 session_opener 不算承接", () => {
    expect(isPairLinked({ kind: "session_opener", note: "开场" }, previousAnswer).state).toBe("unlinked");
  });

  test("承接方式不在合同四种之内判未承接", () => {
    const linkage = { ...validLinkage, linkage: "vibes" } as unknown as QuestionLinkage;
    expect(isPairLinked(linkage, previousAnswer).reasons.join("")).toContain("不在四种合同方式之内");
  });
});

describe("FR-26 会话级承接检查器（<10% 二值断言）", () => {
  const round = (id: string, linked: boolean): ConsecutiveRoundPair => ({
    question: { id, linkage: linked ? validLinkage : undefined },
    previousAnswer,
  });

  test("全部承接：未承接占比 0，通过", () => {
    const report = checkSessionLinkage([
      { question: { id: "q0", linkage: { kind: "session_opener", note: "开场题" } }, previousAnswer: null },
      ...Array.from({ length: 10 }, (_, i) => round(`q${i + 1}`, true)),
    ]);
    expect(report.pairs).toBe(10);
    expect(report.unlinkedPairs).toBe(0);
    expect(report.passes).toBe(true);
  });

  test("10 对里 1 对无承接 = 恰好 10%，不达标（必须严格小于）", () => {
    const report = checkSessionLinkage([
      { question: { id: "q0" }, previousAnswer: null },
      ...Array.from({ length: 10 }, (_, i) => round(`q${i + 1}`, i !== 0)),
    ]);
    expect(LINKAGE_MAX_UNLINKED_RATIO).toBe(0.1);
    expect(report.pairs).toBe(10);
    expect(report.unlinkedPairs).toBe(1);
    expect(report.unlinkedRatio).toBeCloseTo(0.1);
    expect(report.passes).toBe(false);
  });

  test("12 对里 1 对无承接 ≈ 8.3%，通过", () => {
    const report = checkSessionLinkage([
      { question: { id: "q0" }, previousAnswer: null },
      ...Array.from({ length: 12 }, (_, i) => round(`q${i + 1}`, i !== 0)),
    ]);
    expect(report.unlinkedRatio).toBeLessThan(0.1);
    expect(report.passes).toBe(true);
  });

  test("上一题没答的回合如实排除出分母，不虚报承接率", () => {
    const report = checkSessionLinkage([
      { question: { id: "q0" }, previousAnswer: null },
      { question: { id: "q1" }, previousAnswer: null }, // 第一题跳过了
      round("q2", true),
    ]);
    expect(report.skippedPairs).toBe(1);
    expect(report.pairs).toBe(1);
    expect(report.failures).toHaveLength(0);
  });

  test("违规回合带逐对原因，可定位到题目", () => {
    const report = checkSessionLinkage([
      { question: { id: "q0" }, previousAnswer: null },
      { question: { id: "q1" }, previousAnswer: "只答了一句" },
    ]);
    expect(report.passes).toBe(false);
    expect(report.failures[0].questionId).toBe("q1");
    expect(report.failures[0].reasons.join("")).toContain("没有携带承接结构");
  });
});
