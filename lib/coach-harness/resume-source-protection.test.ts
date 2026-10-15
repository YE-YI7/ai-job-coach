import { resumeSourceProtection } from "./resume-source-protection";
test.each(['在读','预计毕业','肄业','结业','未毕业','未获得学位','未取得学位'])('education status %s cannot disappear behind dates',status=>{
  const before=`示例大学｜信息管理｜本科${status}｜2023.09–2027.06`;
  expect(resumeSourceProtection(before,'示例大学 信息管理 本科 2023.09–2027.06','教育背景',`## 教育背景\n${before}`)).not.toEqual([]);
  expect(resumeSourceProtection(before,`示例大学 信息管理 本科${status} 2023.09–2027.06`,'教育背景',`## 教育背景\n${before}`)).toEqual([]);
});
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

test('a source label in the same unchanged heading can qualify concise bullets',()=>{
  const before='- 在课程项目中使用 React 完成两个页面，目前还是课程原型。';
  expect(resumeSourceProtection(before,'- 使用 React 完成两个页面，处于课程原型阶段。','项目经历',`### 图书系统｜课程项目\n${before}`)).toEqual([]);
  expect(resumeSourceProtection(before,'- 使用 React 完成两个页面','项目经历',`### 旧项目｜课程项目\n其他经历\n### 新项目\n${before}`)).not.toEqual([]);
  expect(resumeSourceProtection('### 图书系统｜课程项目','### 图书系统','项目经历','### 图书系统｜课程项目')).not.toEqual([]);
  expect(resumeSourceProtection(before,'- 使用 React 完成两个页面','项目经历',`### 课程项目\n${before}\n### 新项目\n${before}`)).not.toEqual([]);
});
