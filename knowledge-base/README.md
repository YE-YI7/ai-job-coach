# 益职求职知识库

这是益职 Agent 实际使用的知识库，不是原帖数据库。

知识库分为三层：

1. `data/job-knowledge.seed.json`：公开来源与摘要，只是证据层。
2. `knowledge-base/domains/`：经过归纳、交叉验证并写明边界的知识文档，是真正的知识层。
3. `data/knowledge-documents.generated.json`：供网页端和 Plugin 检索的编译产物，不手工编辑。

每篇知识文档都在 `manifest.json` 中声明 Description、Goal、适用任务、边界和证据来源。Agent 应先检索知识文档，再根据需要追溯原始来源。

维护入口见 `SOURCE_OF_TRUTH.md`。

## 简历修改方法

- [事实与改写质量](domains/shared/resume-factual-rewriting.md)：已有事实先改，短 bullet，不拔高职责或编结果。
- [逐步补问](domains/shared/resume-progressive-discovery.md)：一次一个问题，回答后继续改，不知道可以跳过。
- [原样式与交付检查](domains/shared/resume-layout-and-export.md)：局部修改，保存刷新与实际 PDF 分开核验。
- [2026-10-16 来源筛选、许可与采用边界](reviews/2026-10-16-resume-skills.md)：7 份公开 Skill 审读记录。外部方法不是用户事实，不直接安装运行。
