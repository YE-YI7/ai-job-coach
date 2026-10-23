# 生产迁移基线恢复与隔离验收

## 恢复口径

先前“62条生产/44份本地”不是只少18个：版本号、拆分方式和早期初始化都有差异。本轮通过只读 `supabase_migrations.schema_migrations` 取回62版真实SQL，以原生产版本号/名称恢复 `supabase/migrations/`；原44份原样归档。不是凭旧SQL拼造基线，不对生产运行db pull（会登记历史）、migration repair、reset或push。

生产结构另外从只读pg_catalog取得，不读业务行；日期、版本、逐文件SHA256及分项结构指纹在 `supabase/verification/production-20261023.json`。比较包含62表/592列/193索引/263约束/39函数/6触发器/2序列、RLS标志、策略、表和函数ACL、默认权限。它是public应用结构基线，不是整项目物理备份或Auth/Storage迁移。

## 重现

运行 `npm run schema:verify`。只需Node22+、Docker和固定digest的PostgreSQL17.6镜像；不需要Supabase URL、密钥或付费资源。脚本不接受外部数据库地址，不发布端口，容器 `--network none`。每次建全新库，结束删除本次容器。

平台夹具仅提供Supabase托管角色、扩展、最小auth.users/auth.uid契约及生产对应默认权限。早期pg_trgm最初位于public，随后迁移至extensions；不能一开始放错位置而误判迁移失败。夹具不是托管Auth服务的完整实现，不能据此宣称重新验过OAuth/短信供应商。

回放后先逐项比对生产指纹，再确认所有public表为空；执行手机号登录/绑定、恢复、发送预约和简历收费边界SQL断言，全部ROLLBACK，最后再次断言空库。额外门禁确保整份简历不能消耗旧daily字段，首次一段体验不可重复，已有余额不变。CI增加同一个离线隔离重建作业。

## 历史风险与发布

历史含两次DROP旧产品及短暂误建REBIRTH结构，忠实保留原生产日志内容；后续迁移会清除它们。绝不能把历史重放用作生产修复。生产已有这62个版本，版本清单应完全一致；本次应用发布不应用任何数据库迁移。

旧根目录SQL、sql/、mysql/、supabase/schema.sql与原44份迁移已在隔离核验通过后归档到 `docs/archive/sql-20261023/`，可从Git恢复。维护文档更新现行路径，生成的.qoder历史文档只标注过期，不把其引用当部署入口。

本次仅复制既有结构，不通过修改权限来“修绿”比较结果。安全顾问指出的既有孤立函数/外部Auth配置警告需单独评估，不借恢复基线顺手变更生产权限、用户或积分。
