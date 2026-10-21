# 不升级套餐：部署存储优化方案

2026-10-21（America/Los_Angeles）。用户明确选择「暂不升级，先看优化方案」。本文件是待批准执行的方案，不代表已删除部署、改保留期、购买服务或释放容量。

## 已核事实

- 团队Hobby、无blocked/softBlock；近30天用量UI：函数存储8.58/10GB，静态部署存储2.98/10GB。这是团队窗口累计口径，尚未取得有效逐项目拆分，不能把8.58GB都归益职。
- 益职项目当前保留元数据：Preview/Production/Canceled/Errored均30天，`deploymentsToKeep:10`；默认函数区域iad1。保留例外还包括正式别名、活跃分支最新Preview等，不把「改为7天」承诺成7天准时删除。
- 正式代表构建Resources元数据有356个输出条目；已见最大lambda输出17,017,705字节，例如api/admin/eval-experiments、api/admin/eval-feedback。`.rsc`镜像和共享包也有重复条目，不能将这些size直接求和冒称账单占用；只作为后续依赖追踪的待查样本，不断言PDF包就是根因。
- 文档提交ec2ffdd/ce5dfe5曾自动生成READY Preview；同一代码e7f6cb5有自动Preview和手工Production。当前SEO提交bb70d9c也走GitHub Preview＋已验收的暂存Production，后者提升到正式域未重构建。重复触发是已见事实，不是所有容量的确定归因。
- 新正式版本 `dpl_FZGGjoTQZhMwvQ9DvJ2yWmicmKbj` / bb70d9c；上一稳定回滚版本 `dpl_9d3XJNTbQqBoaffrjohy4fK8fTCs` / e7f6cb5。不得将这两个列入清理名单。
- 该存储保存部署产物/函数包，不是Supabase里的简历、作答和积分；另买Blob或数据库不能直接解决此告警。近30天窗口不是可立即归零的物理磁盘剩余量。

## 建议顺序与验收

| 顺序 | 建议 | 保护和验收 |
| --- | --- | --- |
| 1 | 先按项目拆用量，列各项目历史Preview/Production数量与函数体积；不以团队总量推算益职节省量 | 只读，固定同一团队和时间窗；记录无法取得的字段，不填0 |
| 2 | 文档/截图/审校报告的纯改动跳过云构建；普通开发仍保留Preview | `ignoreCommand`用正向运行时变更判断，知识库data/编译脚本、运行时eval夹具、package/锁文件、配置都必须触构建；只跳过确认无运行时用途的文档，不粗暴忽略所有md/json。以多文件推送、浅克隆/缺基准、删除/改名等做回归；无法判断时继续构建 |
| 3 | 同一发布只保留一条正式构建路径：暂存Production→验收→提升同一版本；专用发布分支不重复生成自动Preview | 不全局断开Git、不关部署保护、不丢常规PR预览。先固定release分支/触发器边界，验证代码变更仍可发布，文档变更不生成新函数包 |
| 4 | 经确认后，仅益职项目Preview由30天缩至7天，Canceled/Errored建议7天，Production先保持30天 | 先导出可清理部署ID与别名、确认不在审校/外部待批准流程中；保留当前正式、上一稳定版和仍使用的预览。只改项目不勾「所有项目」。这是提案，未执行 |
| 5 | 对代表构建的Resources函数体积做前后对照，再窄改依赖/导入/追踪输出 | 不靠删node_modules名字猜收益，不删PDF解析/打印所需原生依赖，不缩模型超时冒充存储优化；保留现有单区域，现无证据要进一步砍区域。每次只改一个变量，验收上传解析、聊天、保存刷新、PDF后才发布 |

先做2/3以停止新增无效产物，4需要确认失去历史预览的范围；5在测到大包后才做。**不先承诺节省百分比**。记录每次有效代码变更的构建次数、纯文档构建次数、每构建函数体积；用同一窗口在Usage刷新后比较，历史累计量不会即时消失。

## 可外包边界

- Qoder适合：为「纯文档跳过构建」写独立判断脚本和表驱动测试，交文件不接云权限、不删部署、不改用户数据、不部署；由Codex审知识库/运行时夹具例外、实际Git触发及最终云配置。用户同意执行方案后再给精确工单，不在本轮自动派单。
- Grok/DS适合：整理逐项目只读用量与部署清单、指出重复触发；不能凭清单直接清理、关闭别名或修改凭据。

## 不升级仍需知道的限制

官方Hobby仅限个人非商业用途，益职已经收费，因此容量优化不能替代套餐许可判断。用户已选择暂不升级，本轮不购买、不开试用、不保存支付信息；先提供方案，不把优化描述为长期免费商用方案。

官方核验：[Deployment Storage](https://vercel.com/docs/deployment-storage)、[优化](https://vercel.com/docs/deployment-storage/optimize)、[保留策略](https://vercel.com/docs/deployment-retention)、[ignoreCommand](https://vercel.com/docs/project-configuration/vercel-json#ignorecommand)、[Hobby限制](https://vercel.com/docs/plans/hobby)。
