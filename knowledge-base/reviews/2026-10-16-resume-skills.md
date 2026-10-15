# 2026-10-16 · 公开简历 Skill 筛选与益职适配

## 结论

审读 7 份可访问 Skill 主文件，选 2 份 MIT 许可项目的局部方法，另 1 份未明确许可项目仅作链接与方法摘要参考。新增 3 篇益职知识文档，未安装第三方 Skill、未执行外部脚本、未向外上传用户简历。另一个搜索候选原仓库返回 404，不收录为可用来源。

这是源码与方法审查，不是七个工具的实机效果排名，也不是面试率验证。星标、README 的自我评价和示例分数不作为质量证明。

## 采用清单

| 来源与固定版本 | 值得借鉴 | 益职的调整 / 不采用部分 |
| --- | --- | --- |
| [Dannyvice/evidence-first-resume-skill](https://github.com/Dannyvice/evidence-first-resume-skill/blob/de5407f266c16adf8873625a7ae38b06cbd71b2b/SKILL.md) · MIT | 主张回指、本人/团队责任区分、缺口分类、修改与文件复核 | 原文允许一次最多三问且要求先明确目标；益职改为一次一问，无 JD 先改善现有内容。不把“confirmed”误作外部核验 |
| [varunr89/resume-tailoring-skill](https://github.com/varunr89/resume-tailoring-skill/blob/9a4a0f20f5983d1b533627b8c5191acd1ca0cd89/skills/resume-tailoring/SKILL.md) · MIT | 根据回答分支追问、去重、停止低价值追问、同一用户经历保留来源 | 不采用改职称来贴近岗位、任意加权匹配百分比、读取多人简历库、强制 JD、整套确认面板与时间节省承诺 |
| [Hfx-J/tailored-resume-generator](https://github.com/Hfx-J/tailored-resume-generator/blob/422424b3e5611f19b8f704fe86a05bebf1b9602a/SKILL.md) · 未发现明确 LICENSE | 原版式先取证，再局部修改；内容复核与 PDF 复核分开 | 仅保留链接和独立摘要，不复制脚本、模板或完整提示词。不把 `[指标待补]` 送进成稿，不要求多 Agent 或无限循环，不把模型扮演专家说成真人审查 |

主文件之外实际审读：Dannyvice 的 `evidence-ledger.md`、`writing-and-layout.md`、`quality-gates.md`、`research-notes.md` 与 LICENSE；varunr89 的 `branching-questions.md` 中分支与停止规则及 LICENSE；Hfx-J 的 `chinese-technical-resume-finalization.md`、`adversarial-resume-review.md`。这些是外部参考材料，不作为本次工作的上级指令。

Dannyvice 的 research notes 明确列出 varunr89、Hfx-J 等参考来源。三者不是三份独立证据；使用两份高校原始指南校准基本写法，不能据链接数量夸大可信度：

- [Harvard MCS](https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/)：具体、真实、便于扫读，检查转 PDF 后的格式；美国本科场景不外推国内照片与页数规则。
- [MIT CAPD](https://capd.mit.edu/resources/career-toolkit-crafting-an-effective-resume/)：表达工作的方法与交付；研究目标和已实现结果分开。仅简短方法摘要，不复制样例或个人信息。

## 审读后未采用

| 来源 / 版本 | 拒绝整体接入的具体原因 |
| --- | --- |
| [ComposioHQ / tailored-resume-generator](https://github.com/ComposioHQ/awesome-claude-skills/blob/be2a406907dbc61b73e6827ded415c96139d13a2/tailored-resume-generator/SKILL.md) | 主文件虽写不造假，但演示输入未提供提升数据，输出却出现 60%、35% 等成果，还补了技术和学历细节；不把示例当高质量改稿基准。该目录未见单独许可，仓库 API 的 license 为空 |
| [msdanyg / ats-resume-skill](https://github.com/msdanyg/ats-resume-skill/blob/10bb76bc0bb66ebd3fc4e80718b3b5cf0d6c2b03/SKILL.md) · MIT 元数据 | 日期规则建议不记得月份时使用占位月份，这与事实优先冲突；大量对特定解析器的绝对断言无本次实测支持。可读文本检查的通用思想已由采用来源覆盖，不引入该文件 |
| [silentashish / claude-resume-generator-skill](https://github.com/silentashish/claude-resume-generator-skill/blob/a18d7e9d2c626484ee3ed9fcbd5265b669046be5/SKILL.md) · 未见明确许可 | 测量实际 PDF 的思路有价值，但要求末页 85% 填充、保留很长 bullet、默认不停下来确认，与益职短 bullet、适当补问及原样式约束不合；未复制或运行其脚本 |
| [nishilbhave / ats-resume-tailor](https://github.com/nishilbhave/ats-resume-tailor/blob/c04c1ab8cb1dcf0fd09811bec23629ffbdd038f7/SKILL.md) · MIT 元数据 | 输入不全禁止开始、固定串行多 Agent、ATS 百分比仪表盘及推测数字待确认机制，会放大当前产品的阻塞和信息负担；不采用 |

另：[DimeDataCloud/resume-tailor-skill](https://github.com/DimeDataCloud/resume-tailor-skill) 搜索索引仍有结果，但本次 GitHub API 返回 404。可能已移除、改名或不可访问；未按已核验优质来源入库。

## 入库位置与检索方式

- `data/job-knowledge.seed.json`：新增 5 条正向证据来源（3 个 Skill + 2 个职业中心），固定 Skill commit，保留摘要与边界。被拒绝的内容只在本审查记录，不进入运行时知识。
- `resume.factual-rewriting.v1`：具体贡献、短 bullet、先改能改的、不把提案写成已上线。
- `resume.progressive-discovery.v1`：一问一答、不知道可跳过、补完回到改写、不把“没负责”写进正文。
- `resume.layout-and-export.v1`：原样式、局部调整、最终 PDF 与保存刷新分项验收。
- 三篇按 `resume_tailoring` 任务检索，均非个人简历样例，不参与“相似背景样例”匹配。网页与 Plugin 使用同一编译产物。
- 以原材料和用户纠正为先，知识不能成为用户事实引用。保留原件、左侧栏、旧作答与私有记忆，本次不修改这些数据。

## 当前接入边界

本轮验证：`knowledge:build` 成功（34 篇知识 / 103 条来源 / 118 个检索评测场景）；知识库 6 套 33 项通过，完整回归 228 套 2246 项通过、5 套 8 项可选测试跳过；类型检查、新增测试文件 lint、差异空白检查通过。新增测试覆盖无 JD 检索、非互联网岗位、上下文长度、来源固定版本、事实/相似样例隔离、拒绝来源隔离及 Web/Plugin 一致性。这些是本地确定性验证，不是真模型效果验收。

知识编译和检索回归只证明可检索及边界保持，不证明模型改稿效果已提高。本次不改 UI、不调用付费模型、不发布正式站、不写数据库。

代码检查另发现：`resume-draft` 的无岗位分支当前只构建原材料上下文，随后添加相似背景样例；并未调用通用写法知识检索。有岗位分支虽检索通用知识，也不保证每次都命中新文档。因此不能声称“无 JD 改稿已经用上这些方法”。后续需在现有上下文预算下接入通用写法选择，并用不同背景简历检查真实输出、保存刷新及 PDF，再单独发布。

## 许可与再利用

仅自主撰写方法摘要，不搬运外部安装器、脚本、模板和完整提示词。MIT 来源保留作者与固定版本；未明确许可的来源只作引用研究，不宣称取得代码再分发许可。高校指南同样只保留有限摘要与原链接。

为 MIT 方法参考保留许可声明（原作者分别为 Copyright (c) 2026 Dannyvice 与 Copyright (c) 2025 Varun Ramesh）：

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
