import { appendResumeSupplement, resumeRecovery } from "./resume-recovery";

test("asks about an exact supplied experience, not invented achievements", () => {
  const resume = "某同学\n邮箱 test@example.invalid\n协助整理门店销售数据，制作每周汇总表。";
  const result = resumeRecovery(resume);
  expect(resume).toContain(result.sourceExcerpt);
  expect(result.sourceExcerpt).toBe("协助整理门店销售数据，制作每周汇总表。");
  expect(result.question).toContain("没有数字也可以");
});
test("a sparse resume gets one factual starter question without leaking contacts", () => {
  const result = resumeRecovery("姓名\n项目：\n邮箱 test@example.invalid");
  expect(result.sourceExcerpt).toBe("");
  expect(result.question).toContain("实际做过");
});
test("preserves original and labels detail as self-reported, not verified", () => {
  const text = appendResumeSupplement("协助整理数据", "  核对表格里的日期，交付一份周报。  ");
  expect(text).toMatch(/^协助整理数据\n/);
  expect(text).toContain("用户提供，待核实");
  expect(text).toContain("核对表格里的日期，交付一份周报。");
});
test("rejects empty and oversized details instead of silently truncating", () => {
  expect(() => appendResumeSupplement("原文", " ")).toThrow();
  expect(() => appendResumeSupplement("原文", "字".repeat(2001))).toThrow();
  expect(() => appendResumeSupplement("字".repeat(29995), "十个真实的补充字数")).toThrow();
});
test("after a saved detail it does not ask the same supplementation question again", () => {
  const result = resumeRecovery(appendResumeSupplement("协助整理门店数据", "核对日期、补齐缺项，交付周报给店长。"));
  expect(result.detailSaved).toBe(true);
  expect(result.sourceExcerpt).toBe("核对日期、补齐缺项，交付周报给店长。");
  expect(result.question).toContain("不需要反复补同一段");
});
