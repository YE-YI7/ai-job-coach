import { resumeSourceProtection } from "./resume-source-protection";
test("automatic editing leaves identity and contact untouched", () => {
  expect(resumeSourceProtection("林补充（虚构 QA）", "林补充", "姓名栏")).not.toEqual([]);
  expect(resumeSourceProtection("邮箱：test@example.invalid", "test@example.invalid", "其他")).not.toEqual([]);
  expect(resumeSourceProtection("13800138000", "手机号省略", "其他")).not.toEqual([]);
  expect(resumeSourceProtection("林研", "林岩", "其他", "林研\n项目经历\n协助整理记录")).not.toEqual([]);
});
test("fictitious and learning projects cannot lose their source labels", () => {
  expect(resumeSourceProtection("课程项目：模拟订单工具", "订单工具", "项目经历")).not.toEqual([]);
  expect(resumeSourceProtection("虚构 QA 练习", "QA 项目", "项目经历")).not.toEqual([]);
  expect(resumeSourceProtection("课程项目：模拟订单工具", "课程项目：模拟订单工具，整理了测试步骤", "项目经历")).toEqual([]);
});
test("ordinary project names and factual edits are not identity fields", () => {
  expect(resumeSourceProtection("协助整理走查记录", "整理走查记录，并保留协助责任", "项目经历")).toEqual([]);
  expect(resumeSourceProtection("协助整理走查记录", "协助整理记录", "个人信息保护平台项目")).toEqual([]);
});
