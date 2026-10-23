# 旧 SQL 历史归档（禁止执行）

2026-10-23：先完成生产62版的隔离回放与pg_catalog结构/权限比较，才移动这些文件；没有删除业务数据，也没有在生产重放历史。

- `root/`：原根目录5份旧初始化/修复脚本。
- `sql/`：原8份早期独立补丁。
- `mysql/`：已不在运行链路的旧MySQL结构与说明。
- `supabase/schema.sql`：原不完整初始化。
- `supabase-migrations/`：原44份本地迁移副本，保留原内容；一些时间戳和生产日志不同，不得和现行62版一起跑。

现行唯一应用DDL路径是 `supabase/migrations/`。恢复依据、版本与哈希、隔离验证范围见 `docs/architecture/2026-10-23-migration-baseline.md` 和 `supabase/verification/production-20261023.json`。

本目录内以及 `.qoder/repowiki/` 的旧说明仅为历史快照，命令不再适用。不要复制其导入步骤到生产，不修复/重置生产迁移历史。
