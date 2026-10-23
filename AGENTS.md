# 项目规则

## 数据库结构来源

- 新增数据库结构变更只维护在 `supabase/migrations/`，不得继续往根目录旧 SQL、`sql/`、`mysql/` 或 `supabase/schema.sql` 添加补丁，也不得直接执行旧初始化脚本修生产。
- **迁移目录目前不是完整生产基线**：早期生产迁移和手工建表没有全部入库。核对当前列/约束须查生产只读元数据及注明日期的 `data/supabase-production-schema.json`；快照是验收依据，不是可直接部署的 DDL。
- 在补齐、验证干净库回放之前，不得声称 `supabase/migrations/` 能从零重建生产，也不得据此删除/归档仍承载历史证据的旧 SQL。见 `docs/architecture/2026-10-23-schema-and-orchestrator-audit.md`。`CLAUDE.md` 通过 `@AGENTS.md` 引用本规则，不另维护副本。

## 大文件只拆本次涉及的块

- 改动 `components/cockpit/CockpitApp.tsx`、`lib/coach-harness/resume-execution.ts`、`app/interview/review/page.tsx` 时，只把本次确实涉及的职责块提取为独立组件/函数；不发起无关的整文件重构、批量格式化或顺手修改其他功能。
- 本次新写/修改的代码单行超过约200字符时，按对象字段、调用参数、条件分支等逻辑边界断行。不要为字数截断字符串、URL、正则或改变提示词；长字符串可在不改变内容的前提下独立为常量。
- 拆分前保留现有边界和回归断言，拆分后按涉及功能验收。有关简历/导师时，保留模型选择、渐进聊天和持久化语义；涉及打印时验实际PDF。不能把删除检查、默认成功或改变收费当成代码清理。
- 提交前检查局部diff：只包含本次职责块和必要测试。历史长行/其他区域只记录，不扩大修复。本规则不要求本轮改动上述三个文件；本轮不新增全仓max-len门禁，以免噪音淹没实际问题。

## 知识库调用

- 修改求职建议、岗位分析、简历、模拟面试或复盘逻辑前，先读取 `knowledge-base/SOURCE_OF_TRUTH.md`。
- 根据知识库导航定位并读取相关知识文档；来源数据库只作为证据层，不能把单条原帖摘要直接当成结论。
- 多个来源冲突时，保留冲突并说明证据强弱；当前 JD、用户真实经历和真实面试记录优先。
- 新增公开资料先进入 `data/job-knowledge.seed.json`，只有完成交叉验证和提炼后才能写入知识文档。
- 更新知识文档后运行 `npm run knowledge:build`，同步网页端和 Plugin 的编译产物。
