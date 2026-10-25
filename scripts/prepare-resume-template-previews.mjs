// 只使用固定虚构材料，生成与正式 PDF 共用渲染器的离线验收页。
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error("请提供绝对输出目录");
const compiled = mkdtempSync(path.join(tmpdir(), "yizhi-template-compile-"));
execFileSync("node_modules/.bin/tsc", [
  "lib/resume-print.ts", "--outDir", compiled, "--module", "commonjs",
  "--target", "es2022", "--esModuleInterop", "--noCheck",
], { stdio: "inherit" });
const { printTemplates, resumePrintHtml } = createRequire(import.meta.url)(
  path.join(compiled, "resume-print.js"),
);
const fixture = `陈知远
求职方向：AI 产品经理
虚构模板示例 · 上海 · 联系方式由本人填写

教育背景
示例大学 · 信息管理与信息系统 · 本科
2018.09 — 2022.06

工作经历
示例科技 · 产品经理
2023.07 — 至今
- 访谈 12 位客服，梳理知识查找与回答确认流程，交付需求说明和可交互原型。
- 设计 50 条验收样本，记录回答依据、人工判定与失败原因，组织两轮评审。
- 联合研发完成内部试用，按周整理反馈，明确下一轮要验证的问题。

示例服务 · 产品助理
2022.07 — 2023.06
- 整理用户反馈并归类问题，协助推进需求评审、联调和上线验收。
- 维护产品使用说明，追踪反馈是否关闭，帮助团队复用已验证的处理方式。

项目经历
客服知识助手 · 项目负责人
2024.03 — 2024.06
- 将问题、证据检索、回答确认拆成可测试的流程，完成原型和评估方案。
- 保留低置信度与无依据答案的人工确认入口，不将模型返回直接当成任务成功。

专业技能
- 产品调研、需求拆解、原型设计、测试验收与跨团队沟通。
- 了解检索增强生成与效果评估，能用小样本定位失败环节。`;

mkdirSync(output, { recursive: true });
for (const key of Object.keys(printTemplates)) {
  writeFileSync(path.join(output, `${key}.html`),
    resumePrintHtml(fixture, key, `虚构模板预览 · ${printTemplates[key].label}`, { toolbar: false }));
}
const hash = (value) => createHash("sha256").update(value).digest("hex");
writeFileSync(path.join(output, "manifest.json"), JSON.stringify({
  rendererSha256: hash(readFileSync("lib/resume-print.ts")),
  rendererDependencies: {
    fontLoader: hash(readFileSync('lib/resume-print-fonts.ts')),
    regular: hash(readFileSync('public/fonts/noto-serif-sc-print-regular.woff2')),
    semibold: hash(readFileSync('public/fonts/noto-serif-sc-print-semibold.woff2')),
  },
  fixtureSha256: hash(fixture),
  templates: Object.keys(printTemplates),
  fictional: true,
}, null, 2));
console.log(`六份虚构模板离线页：${output}`);
