# Schema 与旧编排器：清理前核对

核验日期：2026-10-23。范围是代码与只读迁移元数据；未执行 DDL、重放迁移、修改生产配置或用户数据。

## Schema：后续变更单一入口，不等于历史已齐

`lib/db.ts` 当前只创建 Supabase 服务端客户端，没有 MySQL 运行分支；构建/部署脚本没有执行旧 SQL 的引用。后续结构变更只放 `supabase/migrations/`。

但生产迁移历史返回 **62 条**，本地只有 **44 个** SQL 文件。历史版本号/名称也有差异，不能简单把数量差当成恰好缺18个可直接补入文件。最早本地迁移引用已存在的表与函数；目录没有完整的 users / sessions / 旧面试基础建表链。`lib/db-schema-contract.test.ts` 也明确使用 `data/supabase-production-schema.json`，因为存在迁移目录之外的历史表。

因此任务所要求的“确认生产只依赖本地 migrations，再归档其他脚本”的前提尚不成立。本轮只删除已核对为零字节、未被脚本引用的 `rmdir`、`npm`、`next`、`ai-job-coach@0.1.0`；可从 Git 恢复。根目录5份SQL、sql/8份、mysql/及额外发现的 supabase/schema.sql 暂不移动，不写虚假的“完整唯一schema”说明。

后续独立任务：只读核对生产历史、DDL与权限，整理不含用户数据的基线；先在隔离空库验证回放及合同测试，再归档旧脚本、更新引用。此过程需要单独验收，不能顺手对生产执行初始化或 migration repair。旧 SQL 只作历史线索，不是建议执行的修复入口。

## Orchestrator：仍是可达旧入口，不删

| 范围 | 当前关系 | 本轮决定 |
| --- | --- | --- |
| `app/api/chat/route.ts` → `lib/orchestrator/index.ts` → `stageAgent.ts` | 服务端 `/api/chat` 仍直接调用；阶段路由分配职业规划、项目、简历、投递、面试、谈薪与 offer | 保留，不能因调用点少判死代码 |
| `lib/orchestrator/models/` 与 `prompts/` 七组 | 被 stageAgent 的 switch 分支静态导入；最终共用 lib/llm.ts，但不是当前简历任务闭环 | 全部保留；未证明其中任何一组可独立归档 |
| `coach-harness` | 新作战盘的 context / facts / tasks / artifacts / Eval / review 等；旧 `/api/chat` 也在外围调用部分 harness 能力 | 共存，不是旧目录已自动被完全替代 |
| 测试直接引用 | match-score 与 unfounded-match-score 测试仍覆盖旧模型/源码 | 保留测试，不以删测试实现清理 |
| `lib/orchestrator/README.md` | 有“所有阶段 deepseek-chat”等历史描述；实际供应商由共用 llm 的站点配置/用户连接解析 | 应作为旧架构说明看待，不据其配置生产模型 |

可以考虑归档的只是将来证明不可达且有替代验收的旧实现，不是这17个 TS 文件中的现成名单。本轮没有删目录、迁移路由或改聊天行为。
