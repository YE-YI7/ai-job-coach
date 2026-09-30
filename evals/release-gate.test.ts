import { experienceMetrics, replayGate } from "./release-gate";

const valid = { id: "one", rawReply: "模型输出", visibleReply: "可见内容", machineVerdict: "无自动命中" };
test("全调用失败、空响应、缺裁决、漏样本都不能写成通过", () => {
  for (const rows of [[], [{ ...valid, error: "HTTP 500" }], [{ ...valid, rawReply: "" }], [{ ...valid, machineVerdict: "" }]]) {
    expect(replayGate(rows, 1).automaticChecksPassed).toBe(false);
  }
});
test("护栏误挡和漏放会让回放门失败", () => {
  expect(replayGate([{ ...valid, machineVerdict: "正例被拦（疑似误挡）" }], 1).failures).toHaveLength(1);
});
test("自动检查通过不冒充真人校准", () => {
  expect(replayGate([valid], 1)).toMatchObject({ automaticChecksPassed: true, semanticAcceptance: "not_evaluated" });
});
test("空遥测不是 0 延迟、0 中断、100% 采纳", () => {
  expect(experienceMetrics([])).toMatchObject({ p90FirstVisibleTextMs: null, interruptionRate: null, adoptionRate: null });
});
test("有完成记录但没有中断观测，不能推导中断率为零", () => {
  expect(experienceMetrics([{firstVisibleTextMs:100,interrupted:null,outputCharacters:20,adopted:null}]))
    .toMatchObject({interruptionSamples:0,interruptionRate:null,adoptionSamples:0,adoptionRate:null});
});
test("P90 只计首个可见文本，未呈现采纳按钮的样本不进采纳率", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ firstVisibleTextMs: (i + 1) * 100, interrupted: i === 0, outputCharacters: i * 10, adopted: i < 2 ? i === 0 : null }));
  expect(experienceMetrics(rows)).toMatchObject({ p90FirstVisibleTextMs: 900, interruptionRate: .1, adoptionRate: .5, adoptionSamples: 2, outputLength: { p50: 40, p90: 80 } });
});
