import { companionBinding, companionPrompt, companionVisibleText, companionRetryText, extractCompanionReview } from "./companion-protocol";
import { createTutorStream } from "./tutor-stream";
import { decideCompanion } from "./companion-arrangement";

const binding = { planId: "11111111-1111-4111-8111-111111111111", version: 2, submissionId: "22222222-2222-4222-8222-222222222222" };
const step = { title: "核对一次真实差异", why: "先确认字段的含义", effort: "20 分钟", deliverable: "一组原始与汇总值", check: "差异可回指", stuck: "先交记得的一列" };
test("application binding round trips, is hidden from the user, and cannot be embedded in prose", () => {
  const message = companionPrompt(binding, "这是提交原文");
  expect(companionBinding(message)).toEqual(binding);
  expect(companionVisibleText(message)).toBe("这是提交原文");
  expect(companionBinding(`用户引用：${message}`)).toBeNull();
  expect(companionBinding(companionPrompt({ ...binding, version: -1 }, "x"))).toBeNull();
});
test("retry restores the original binding without showing metadata or overwriting a new draft", () => {
  const original = companionPrompt(binding, "我的提交");
  expect(companionRetryText("我的提交", original)).toBe(original);
  expect(companionRetryText("另一条新草稿", original)).toBe("另一条新草稿");
});
test("valid structured next step is extracted separately from visible Markdown", () => {
  const result = extractCompanionReview(`<answer>**已经够用**。\n下一步核对字段。</answer><companion-review>${JSON.stringify({ decision: "advance", reason: "原句指出字段不一致", step })}</companion-review>`);
  expect(result.review?.step).toEqual(step);
  expect(result.text).toContain("**已经够用**");
  expect(result.text).not.toContain("companion-review");
});
test.each(["{", JSON.stringify({ decision: "advance", reason: "没依据", step: null }), JSON.stringify({ decision: "end", reason: "完成", step }), JSON.stringify({ decision: "advance", reason: "", step })])("malformed structure never leaks metadata or authorizes a task change: %s", json => {
  const result = extractCompanionReview(`正文<companion-review>${json}</companion-review>`);
  expect(result).toEqual({ text: "正文", review: null });
});
test("incremental output hides all split structured fields", () => {
  const emit = jest.fn(); const stream = createTutorStream("提交原文", emit);
  for (const chunk of ["<answer>已经可以继续。", "</answer><companion-", "review>{\"decision\":\"advance\"}</companion-review>"]) stream(chunk);
  expect(emit).toHaveBeenCalledWith("已经可以继续。");
  expect(JSON.stringify(emit.mock.calls)).not.toContain("decision");
});
test("unseen negative intent and input details are not replaced by fixture facts", () => {
  expect(decideCompanion("不想转AI产品经理，还是做运营").goalTitle).not.toBe("转 AI 产品经理");
  const first = decideCompanion("想转AI产品经理");
  expect(decideCompanion("不想转AI产品了，还没定新方向", { ...first, goalKey: "k", sourceText: "原目标", action: "not_started", submissions: [] }).goalTitle).not.toBe("转 AI 产品经理");
  expect(decideCompanion("两个数据库字段不一致").answer).not.toContain("三张表");
  expect(decideCompanion("目标是后端开发，要先学Python吗").answer).not.toContain("不必先学 Python");
  expect(decideCompanion("下周二面试，帮我练项目追问").deadline).toBe("下周二");
});
