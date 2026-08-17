# 益职知识库导航

本文件告诉用户和 Agent：要找什么、去哪里找、哪些内容才是知识，哪些只是来源证据。

## 快速查找

| 要找什么 | 去哪里 | 当前状态／备注 |
|---|---|---|
| Agent 使用知识的总规则 | `policies/agent-usage.md` | 当前有效版本 |
| 知识文档的 Description、Goal 与证据映射 | `manifest.json` | 机器可读真源 |
| 通用求职闭环 | `domains/shared/evidence-driven-job-search.md` | 首版，基于 4 个公开样本 |
| 技术转产品经理 | `domains/product-management/transition-from-engineering.md` | 首版，基于 2 个公开样本 |
| 产品经理投递漏斗 | `domains/product-management/job-search-funnel.md` | 首版，基于 2 个公开样本 |
| 产品经理业务面训练 | `domains/product-management/interview-core.md` | 首版，基于字节、小红书面经 |
| AI 产品岗位面试 | `domains/product-management/ai-product-interview-basics.md` | 首版，低置信度，继续扩证据 |
| AI 产品评测与失败恢复 | `domains/product-management/ai-evaluation-and-operations.md` | 3 个来源，中置信度 |
| AI 产品商业判断 | `domains/product-management/ai-commercial-judgment.md` | 3 个来源，中置信度 |
| 产品案例面 | `domains/product-management/case-interview-live-reasoning.md` | 首版，3 个来源 |
| 角色定位与故事库 | `domains/product-management/story-bank-and-positioning.md` | 首版，5 个来源 |
| 岗位反向验证 | `domains/product-management/role-due-diligence.md` | 单来源，只用于生成反问 |
| 软件工程师首份工作 | `domains/software-engineering/first-job-evidence.md` | 首版，基于 GitHub 指南 |
| 软件工程师技术面准备 | `domains/software-engineering/technical-interview-preparation.md` | 首版，基于 3 个公开样本 |
| 原始来源摘要 | `../data/job-knowledge.seed.json` | 证据层，不直接作为 Agent 结论 |
| 网页端编译产物 | `../data/knowledge-documents.generated.json` | 自动生成，不手工编辑 |
| Plugin 编译产物 | `../.agents/plugins/plugins/yi-zhi/knowledge/knowledge-documents.json` | 自动生成，不手工编辑 |

## 目录职责

| 目录 | 放什么 | 不放什么 |
|---|---|---|
| `domains/shared/` | 跨岗位稳定成立的求职方法 | 单公司、单岗位面经 |
| `domains/product-management/` | 产品经理岗位、转岗、投递和面试知识 | 软件工程技术题 |
| `domains/software-engineering/` | 工程岗位求职和技术面知识 | 产品业务案例题 |
| `policies/` | Agent 如何检索、引用和处理冲突 | 具体岗位知识 |

## 版本与冲突规则

1. `manifest.json` 登记且状态为 `active` 的 Markdown 文档是当前知识版本。
2. 原始来源只证明“有人这样经历或建议过”，不能独立升级成普遍规律。
3. 多来源重复出现的模式优先；单公司、单团队、单轮次经验必须保留样本边界。
4. 当前 JD、用户简历、真实回答与真实面试记录，优先于公共知识。
5. 无法确认时保留冲突，不把推断写成事实。

## 维护规则

- 新资料先进入证据层，去重并保留原始链接、时间和版权模式。
- 只有新资料改变现有结论、覆盖新场景或提高可信度时，才更新知识文档。
- 每次更新知识文档必须同步 `manifest.json` 的证据、置信度和复核日期。
- 运行 `npm run knowledge:build` 后，网页端和 Plugin 才会读取新版本。
