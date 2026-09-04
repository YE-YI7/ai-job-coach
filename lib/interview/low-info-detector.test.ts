import { detectLowInfoAnswer, buildNeedsMoreInputAssessment } from "./low-info-detector";

describe("detectLowInfoAnswer", () => {
  test("detects empty answer", () => {
    expect(detectLowInfoAnswer("")).toEqual({ isLowInfo: true, reason: "empty" });
    expect(detectLowInfoAnswer("   ")).toEqual({ isLowInfo: true, reason: "empty" });
  });

  test("detects punctuation-only answer", () => {
    expect(detectLowInfoAnswer("？？？")).toEqual({ isLowInfo: true, reason: "punctuation_only" });
    expect(detectLowInfoAnswer("...")).toEqual({ isLowInfo: true, reason: "punctuation_only" });
    expect(detectLowInfoAnswer("，，，")).toEqual({ isLowInfo: true, reason: "punctuation_only" });
  });

  test("detects exact-match placeholder words", () => {
    const placeholders = ["不会", "不知道", "不清楚", "没印象", "忘了", "没有", "不记得",
      "不知道啊", "我不会", "我觉得还行", "还好", "一般般", "差不多", "还行吧",
      "可以", "不好", "不好说", "这个问题我没想过", "没了解过", "暂时没有"];
    for (const p of placeholders) {
      expect(detectLowInfoAnswer(p)).toEqual({ isLowInfo: true, reason: "placeholder" });
    }
  });

  test("detects too-short answers", () => {
    // "嗯嗯" matches trailing_placeholder (has placeholder chars) and is short
    expect(detectLowInfoAnswer("嗯嗯")).toEqual({ isLowInfo: true, reason: "trailing_placeholder" });
    expect(detectLowInfoAnswer("哈哈")).toEqual({ isLowInfo: true, reason: "too_short" });
  });

  test("detects repeated characters", () => {
    expect(detectLowInfoAnswer("啊啊啊")).toEqual({ isLowInfo: true, reason: "repeated_char" });
    expect(detectLowInfoAnswer("嗯嗯嗯嗯")).toEqual({ isLowInfo: true, reason: "repeated_char" });
  });

  test("detects repeated words", () => {
    expect(detectLowInfoAnswer("不知道不知道不知道")).toEqual({ isLowInfo: true, reason: "repeated_word" });
    expect(detectLowInfoAnswer("不会不会不会")).toEqual({ isLowInfo: true, reason: "repeated_word" });
  });

  test("detects trailing placeholder in short answers", () => {
    expect(detectLowInfoAnswer("可以嗯嗯")).toEqual({ isLowInfo: true, reason: "trailing_placeholder" });
  });

  test("accepts valid long answers", () => {
    expect(detectLowInfoAnswer("在上一份工作中，我负责了用户增长项目，通过A/B测试优化了注册流程，转化率提升了15%")).toEqual({ isLowInfo: false });
    expect(detectLowInfoAnswer("我使用STAR法则来回答这个问题。Situation是...")).toEqual({ isLowInfo: false });
    expect(detectLowInfoAnswer("这个问题我之前遇到过，当时我们团队面临了用户留存率下降的问题，我分析了数据后发现...")).toEqual({ isLowInfo: false });
  });

  test("accepts short but meaningful answers", () => {
    expect(detectLowInfoAnswer("我主导了这个项目")).toEqual({ isLowInfo: false });
    expect(detectLowInfoAnswer("转化率提升了15个百分点")).toEqual({ isLowInfo: false });
  });
});

describe("buildNeedsMoreInputAssessment", () => {
  test("returns correct needs_more_input structure", () => {
    const result = buildNeedsMoreInputAssessment("empty");
    expect(result.status).toBe("needs_more_input");
    expect(result.score).toBeNull();
    expect(result.evidence).toEqual([]);
    expect(result.followUp).toBeTruthy();
    expect(result.rewritePlan.length).toBeGreaterThan(0);
  });

  test("generates appropriate follow-up for different reasons", () => {
    const emptyResult = buildNeedsMoreInputAssessment("empty");
    expect(emptyResult.followUp).toContain("具体做法");

    const shortResult = buildNeedsMoreInputAssessment("too_short");
    expect(shortResult.followUp).toContain("展开说明");

    const placeholderResult = buildNeedsMoreInputAssessment("placeholder");
    expect(placeholderResult.followUp).toContain("一句话说明");
  });
});
