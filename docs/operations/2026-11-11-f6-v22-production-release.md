# F6 v22 正式发布回执

2026-11-11（America/Los_Angeles）。本人明确要求把刚验过的F6上线，保留自主选工具和HR，不换流程，不改旧作答/积分；Fabel诊断仅阅读存档，不混入本次重构。

## 已实际生效

- 正式URL：<https://yizhioffer.com/cockpit?tab=resume>。
- 部署：`dpl_CsRBEMKjzj823zrJhPj7az7mce3y`，READY，项目 `prj_fav7gQZKEEE2JO3b8v9S9leeRhkS`，既有team `team_7qIutahimwnjCje1fOtQEPyT`。
- 产品源提交：`ec16f86f84bee780a5e2847abcd9987301ce56ad`；不是QA部署直接promote。2031个tracked文件逐项Git blob核同，无预算拦截、模型回放、强制测试用户、导出的.env或测试instrumentation。
- 先以production环境`--skip-domain`构建，真实只读核验后对同一个构建promote；14:56 UTC左右正式核验为`f6-origin-runtime-v22-source-evidence-units`。www的307仍转apex，再读同一runtime。域名inspect确认指向上述新deployment，不只看HTTP200。
- 原F6 system hash `93be16d69b9ba62fc28de3cf63bbad2fabfbdc8a16be053a694e0be0099775c4`；原五工具hash `a893136a0e8485564aab9c5f62d85f3551df25ec2482a1ffbfcb89e4d401ca8d`。工具仍为`read_file/search/fetch/write_output/render_pdf`，由作者自主选择，12作者/4公网上限。
- 保留一轮独立HR自然语言点评及原作者核实/回应，1HR上限、非阻断；不加HR输出解析器，不把结构成功当事实认证。现HR策略hash `f665839ef100ff76b872c739335a7bf282406e7e03aed34b5c07b4b94d41a977`与刚验候选一致。
- 保留模型选择；生产没有强制Step测试模型。真实已登录工作区打开模型菜单再关闭，原选择`DeepSeek V4.1 Flash`仍在，聊天输入/历史/HR入口均在，未点击生成、发送、采纳、撤销或扣费。

## 测试与实际只读核验

- 重新跑全量Jest：378 suites/3477 tests通过，8 suites/24既有条件项跳过；`tsc --noEmit`、diff检查通过，Vercel production云构建成功。
- 待发布URL和正式URL均对照上次已验v22的完整runtime对象逐字段相等，包括system、工具/HR/辅导策略哈希、工具名、上限和modelSelection，而非仅版本字符串。
- 普通匿名任务读取401。虚构QA账号读取只返回自己机会；读取上次真实成稿全文完全相同，6条建议中的1条accepted和5条pending逐对象不变，原文、answers/conversation不变。没有另发模型调用或做数据库写入来伪造验收。
- 本轮不是新收费质量实验：刚才真实HR+作者和采纳/刷新/PDF的证据仍是Eval `cea35957-b6ff-451c-8b73-ee31533d56d4` / Trace `afb3f73e-69f5-4ac7-95be-b7fdf3f8611d`。其首稿重放/新HR和作者的边界仍保留，不改称正式域名从头付费跑过。
- 实际PDF前轮已原生另存、1页A4、1060去格式字符与成稿同、整页渲染通过；本轮未改打印源，也未冒称再次另存新的PDF。
- 发布后新deployment error日志查询窗口未返回错误记录；请求量小，此项不是全部运行无错证明。未新增监控/数据drain。
- 本轮无UI代码编辑，不重新扫无关历史UI。v18涉及的唯一UI文件已有一次限定Impeccable detect `[]`，字节随验收提交原样发布。

## 数据和费用边界

无迁移/SQL/Auth/RLS变更，无新模型请求，无个人钱包/积分/旧作答写入。不自动更新用户历史成稿，用户需刷新并主动点“重新修改整份”才产生新改稿。原¥0.90/27验收批已在21调/保守¥0.6424275封账，发布不重新开账。没有push共享仓库或把其他未提交改动打包；源代码通过CLI的固定提交archive部署，文档随后本地独立提交。

## 回滚点与尚未处理

原正式`dpl_DqeSJ8ATXabCKwp7xqTtjSEiHJRm`/v8保留，必要时可回滚该部署；本轮未执行回滚。以后回滚不得复位用户数据或额度。

本次发布的是已验F6核源/接续修复，不等于完成Fabel建议的输入治理/旧要求确认/主流程拆分/检查瘦身/版本交付。已实查旧instruction仍取最后一条；advisoryDelivery非阻断路径已经存在，不能照旧快照再删护栏。这些单独记录在ME `开发文档/2026-11-11-Fabel诊断与F6发布边界.md`，未擅自实现。

## 证据路径

私有发布目录：`/Users/yi/Documents/Codex/yizhi-f6-release-20261111-iR9Jot`。

- `release-source-parity.json`：2031文件Git blob/sha256。
- `staged-http-verification.json`、`production-http-verification.json`：同策略及虚构保存状态读回。
- `deployment-receipt.json`：仅选取非敏感部署/提交元数据。
- `full-tests.json`：本轮全量回归。
- `production-workspace.png`：正式登录工作区局部实拍，裁掉简历联系方式，保留产品/HR/保存界面。

上一轮成稿/PDF/失败原记录不复制进公共仓库，邀请、会话、密钥和私人简历不随报告提交。
