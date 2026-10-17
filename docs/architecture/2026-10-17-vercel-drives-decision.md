# 益职是否需要 Vercel Drives / Sandbox · 2026-10-17

## 决策

当前不接入、不安装 SDK、不创建云端资源。现有简历原件、逐问补充、改稿版本与浏览器 PDF 的数据形态不需要一个挂载式工作目录。先保留数据库和私有对象存储的既有边界。

以后如果上线服务端 LibreOffice / Python 多文件转换、运行模型生成的脚本、或跨多次运行反复使用依赖与中间文件的作品集生成，再评估 Sandbox。只执行一次的转换先评估短时 Sandbox；有明确重复文件工作目录后，再引入 Drive。后台任务执行/取消/重试仍应单独设计，文件持久化不能替代耐久调度。

本报告来自另一窗口转来的评估请求，与本轮简历 UI 发布分开；没有将 Sandbox / Drives 功能部署生产。

## 公开能力核对

[10月15日官方 GA 公告](https://vercel.com/changelog/vercel-drives-is-now-generally-available)确认 Hobby、Pro、Enterprise 可用；Drive 保留 Sandbox 停止后的目录内容，可 fork 为相互独立的可写副本。当前本地技能文件仍写 beta，本报告以官方公告为准，没有擅自修改技能。

[官方 Drives 文档](https://vercel.com/docs/sandbox/concepts/drives)明确：读写文件需要挂载到 Sandbox；同一 Drive 同时只有一个可写挂载，读共享用只读快照。每次最多4个挂载，Hobby默认1GiB，其他默认1TiB，默认最高16TiB；主区域须匹配且 Drive 创建后区域不可变。fork 前源盘至少要真实写入一次。它不是可直接替换网页文件下载接口的公共对象存储。

公开 [npm 元数据](https://registry.npmjs.org/@vercel%2fsandbox/latest)本轮实查 `@vercel/sandbox` latest **3.8.0**；[JS SDK 文档](https://vercel.com/docs/sandbox/sdk-reference)及 Drives 文档包含 Drive 获取、挂载、快照、fork 和删除 API。这里只核对版本和 API，不将“文档存在”说成“本项目接入实测成功”。

## 对照当前真实代码

| 当前任务 | 已有实现 | 决策 |
| --- | --- | --- |
| 展示/下载上传原简历 | `lib/resume-original.ts` + `app/api/coach/resume-original/route.ts`：4MB上限、私有 resume-originals、用户目录所有权检查、原字节读取 | 继续使用现有对象存储；没有多文件执行目录需求 |
| 导师补问与断点恢复 | `lib/coach-harness/resume-task.ts`：coach_resume_tasks、用户/岗位范围、原文指纹、version CAS、lease；回答先保存再生成 | 继续记录式持久化；Drive 不接管事实与任务真源 |
| 简历改稿与 PDF | `app/api/coach/resume-agent/route.ts` 调现有结构化改稿；`lib/resume-print.ts` 固定渲染HTML，浏览器打印 | 当前没有让模型生成并运行任意程序的路径，不新增VM |
| 多方案并行 | 当前为短文本建议和版本化工作稿 | 暂不复制工作目录；先在现有版本/采纳约束内设计候选比较 |
| 未来脚本/多文件材料 | 当前未发现生成代码、安装依赖、运行转换工具的用户功能 | 需求成立再做隔离执行PoC，不能为了用新能力先造需求 |

本次使用受限目录的代码搜索核对上述路径，没有读取 `.env`、密钥、用户原件或旧作答；未查数据库私人行。已有4MB/30,000字限制及归属校验保留。本结论是当前存储与工作流契约判断，不是新的Supabase容量、安全或长期稳定性审计。

按 Supabase 技能核对当前 changelog 及 [TLS CBC 弃用公告](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)；本报告不涉及新的客户端/协议改造，未变更 Auth、RLS、Storage policy 或数据库 schema。现有应用健康检查不替代新基础设施验收。

## 费用与限制

[官方价格与配额](https://vercel.com/docs/sandbox/pricing)（本轮读取，默认iad1）：Drive存储 $0.05/GB月、读 $0.0015/GB、写 $0.004/GB；Sandbox active CPU $0.128/小时、内存 $0.0212/GB小时、创建 $0.60/百万次。地域价格有差异，这不是本账号账单。

Hobby公开额度含 CPU5小时/月、内存420GB小时/月、创建5000次/月、Drive存储15GB生命周期、读写各30GB/月。超额会暂停创建；Pro按用量计费。单次VM会话上限 Hobby45分钟、Pro24小时。即使CPU只等模型，已分配内存仍会计时；Drive保留期间也有存储用量。

本轮未核对账号剩余额度或升级资格，不以公开免费额度承诺当前账号零成本。没有创建 Sandbox/Drive、拉取 OIDC、创建新密钥、开端口、购买套餐或扩大持续权限。

## 验证与下一步准入

公开公告、SDK/限制/价格与当前源代码核对完成；当前完整回归229套2297项通过，但它们不是云端 Sandbox / fork 测试。没有必要接入的场景，故没有运行会新增云端资源/计费的“演示”来伪造交付。

未来需求成立时，最小验证只用虚构文件：限定同项目/区域、短超时、1vCPU、默认拒绝出网、一次性不保留环境、明确停止与清理；先测单次转换和错误退出，再决定是否需要持久Drive。Drive若入选，按用户/任务映射，验证写者冲突、只读快照、fork隔离、恢复和资源清理，不把用户原件/数据库凭据注入执行环境。

创建资源或测试超出既有授权/可用额度时，先报告预计用量与审批要求。处理真实简历的新增数据去向、保留期和删除机制须先纳入隐私与权限设计；本次没有上传真实资料。
