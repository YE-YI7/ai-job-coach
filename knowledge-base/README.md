# 益职求职知识库

这是益职 Agent 实际使用的知识库，不是原帖数据库。

知识库分为三层：

1. `data/job-knowledge.seed.json`：公开来源与摘要，只是证据层。
2. `knowledge-base/domains/`：经过归纳、交叉验证并写明边界的知识文档，是真正的知识层。
3. `data/knowledge-documents.generated.json`：供网页端和 Plugin 检索的编译产物，不手工编辑。

每篇知识文档都在 `manifest.json` 中声明 Description、Goal、适用任务、边界和证据来源。Agent 应先检索知识文档，再根据需要追溯原始来源。

维护入口见 `SOURCE_OF_TRUTH.md`。
