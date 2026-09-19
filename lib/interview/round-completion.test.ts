import {
  ROUND_REFLECTION_QUESTIONS,
  formatRoundReflection,
  hasRoundReflectionContent,
  resolveRoundCompletionPhase,
} from "./round-completion";

/**
 * 整轮收尾的推进规则：一轮答完 ≠ AI 直接总结。
 * 用户没先写自我复盘之前，AI 点评那一步不允许开始（减少「系统凭空替我复盘」）。
 */
test("一轮刚答完：停在用户自复盘，AI 结论不抢跑", () => {
  expect(resolveRoundCompletionPhase({ roundCompleted: true, hasSelfReflection: false, hasAiSummary: false })).toBe("self_reflection");
});

test("复盘提交后才进入 AI 点评；点评到位才算 done", () => {
  expect(resolveRoundCompletionPhase({ roundCompleted: true, hasSelfReflection: true, hasAiSummary: false })).toBe("ai_summary");
  expect(resolveRoundCompletionPhase({ roundCompleted: true, hasSelfReflection: true, hasAiSummary: true })).toBe("done");
});

test("题没答完就是 answering，AI 点评即使异常存在也不改变推进顺序", () => {
  expect(resolveRoundCompletionPhase({ roundCompleted: false, hasSelfReflection: false, hasAiSummary: false })).toBe("answering");
});

test("全空的复盘不算写过：不能用占位空格骗过状态机", () => {
  expect(hasRoundReflectionContent(["", "   ", ""])).toBe(false);
  expect(hasRoundReflectionContent(["", "卡在第二题的指标口径", ""])).toBe(true);
});

test("拼接复盘：只保留有内容的问答，顺序不乱", () => {
  const text = formatRoundReflection(ROUND_REFLECTION_QUESTIONS, ["第一答", "", "第三答"]);
  expect(text).toContain(`问：${ROUND_REFLECTION_QUESTIONS[0]}\n答：第一答`);
  expect(text).toContain(`问：${ROUND_REFLECTION_QUESTIONS[2]}\n答：第三答`);
  expect(text).not.toContain(ROUND_REFLECTION_QUESTIONS[1]);
  expect(text.indexOf(ROUND_REFLECTION_QUESTIONS[0])).toBeLessThan(text.indexOf(ROUND_REFLECTION_QUESTIONS[2]));
});

test("复盘引导问题保持 3-4 个，别变成填表作业", () => {
  expect(ROUND_REFLECTION_QUESTIONS.length).toBeGreaterThanOrEqual(3);
  expect(ROUND_REFLECTION_QUESTIONS.length).toBeLessThanOrEqual(4);
});
