# 整稿质检返修：原因、修复与真实验收

2026-10-22（America/Los_Angeles）。本人授权继续解决失败，真实模型改稿、保存刷新及实际 PDF 通过后发布；保留模型选择与现有聊天，旧作答、原账号材料和积分不动。

## 结论与发布

- 修复代码 `7a91a8f` → `1e263d2` → `0edf9ff` 已推 `origin/codex/production-release`。
- 干净提交归档 `/tmp/yizhi-review-final.fs4LNF` 构建的 Production `dpl_JAMTV6ieWpFwvtuTUjn6NWcVZq96` 完成真实验收，随后同构建 promote；`yizhioffer.com` 回读指向该 READY 部署，项目 `prj_fav7gQZKEEE2JO3b8v9S9leeRhkS`、team scope、Production 和 `githubCommitSha=0edf9ff` 已核。
- 切换前正式 `dpl_FZGGjoTQZhMwvQ9DvJ2yWmicmKbj`（bb70d9c）与原上稳 `dpl_9d3XJNTbQqBoaffrjohy4fK8fTCs` 均未删除。未从共享脏树部署，未夹带 Cursor/DS 在途首页、工具栏、打印或模板代码。
- 上线后健康接口 HTTP 200 / database=ok；简历 Agent 与真正的 Eval runs API 匿名均为 401；正式域名正常登录隔离 QA 后重新读取同一代次、Trace、修改 ID 和讨论记录。一次误探测不存在的 `/api/admin/evals` 为 404，不把它算权限验收。
- 发布短窗 error 查询无记录，仅代表该查询可见窗口，不宣称长期永不超时。

## 失败是什么

前轮完整事实样本 Trace `a8d9327d-0357-4af5-ad60-80c1804c8503` 中，事实门禁保留 1 条、整稿 findings=0、逐条 useful=1，仍进入编辑返修；新候选随后被事实门禁拒绝。原 reviewer 原始 I/O 没有捕获，不能倒填缺失字段或声称已看见某个原字符串。

按当时控制流和元数据，首轮逐条结论未能满足 `reviewer.status === passed`，却没有可归因的修改问题；系统把**质检输出协议异常**当成**正文质量缺陷**，要求编辑器重写已经有事实支撑的稿件。第二轮生成又可能引入新事实问题，最终丢掉原本可交付的修改。这不是供应商请求超时的证据。

中间版 1e263d2 的带缺口样本实际返回两次 `review_document_invalid`，证明嵌套整稿结论不符合契约；当时只有粗粒度原因，不能进一步证明具体哪一个嵌套字段错误。复核发现提示中有不完整/含糊的输出示例、`真实ID或null` 与 recovery 层级不明确；最终统一契约、明确 JSON null 与 recovery 层级，新增逐字段原因和对应修复提示。修正后两类样本在最终候选均通过；不据此重建旧 reviewer I/O。

## 修复边界

1. 独立质检只判断，不写稿。完整契约同时包含逐条 findings/valueChecks、整稿 document；补问只放顶层 recovery。
2. 无效 status、无可归因的 failed、缺/重复 valueChecks、未知修改 ID、整稿嵌套字段错误等先归类为协议问题。精确原因码只含固定类别，不保存被拒正文、提示词、联系方式或任意字符串。
3. 协议失败时锁住原候选、来源和真实修改 ID，最多让**质检员自己补一次正确判断**，不让编辑器猜问题再生成。仍失败则 503 `resume_review_unavailable`、退还预留、保留原稿和补充。
4. 真正的新正文缺陷仍按 changeId 交回原编辑返修一次；整体错误没有具体 ID 可用 JSON null。没有弱化事实、责任限定、原句定位或格式门禁。
5. 原来缺少事实只记 `missing_information/warning` 并逐问，不因没有数字否决其他安全修改。模糊段落里不虚构“梳理/负责/结果”，被事实门禁拦住的那条不会挤掉其他有依据的修改。
6. `RESUME_WORKFLOW_VERSION=scoped-editor-whole-review-v7`，正文返修与质检协议补全各最多一次。中间版诊断把尚未计算的 useful 记成 0，最终修为 null / `review_contract_invalid`；旧 Trace 保留历史，不把那个 0 当模型无价值判定。

## 确定性回归

最终干净归档 15 套 / 203 项、类型检查、作用域 lint、diff 检查通过；云端 138 路由 Production 构建通过。重点覆盖：

- 无归因失败不重跑编辑；相同候选/ID 交给质检员补全；仍无效时只有 1 次编辑 + 2 次质检、无保存、预留退回。
- 真实整稿错误仍是编辑→质检→原编辑返修→质检，而不是删掉检查。
- 字符串 null、未知 ID、越权改写、嵌套多余字段、failed 却只有 warning、重复/缺失 valueChecks 都单独测试。
- “记不清了”确定性走讨论/跳过，不进入经历事实、不调编辑；保留既有逐步回复、Markdown、安全气泡与讨论判断。

本轮只改后端/测试和证据，不新增 UI 样式修改，因此不额外运行 UI detect；前轮处理摘要 UI 的一次 detect 仍为 0 新增 primary，不能据此豁免 Cursor/DS 尚未验收的在途 UI。

## 真实模型与修改效果

全部为本站 StepFun `step-3.7-flash`、隔离虚构材料，不用本人 TokenDance，不发短信、不兑换/充值。14 次上游调用均成功、provider retry=0；总输入 66,528 / 输出 35,312 tokens，供应商费用估算为 null，不冒称零成本。质量失败与传输成功分开记。共 5 次生成尝试（4 成功、1 中间版被拦），另 3 次讨论；最终候选两类样本均成功，不把它表述成大样本稳定性评估。

| 版本与样本 | Trace | 真实结果 / 流程用时 |
| --- | --- | --- |
| 7a91a8f，完整事实，单经历体验 | `1ae5615a-fc5a-41db-bf21-6ef0403ad5db` | 1 条安全修改，保存；53.108 秒 |
| 1e263d2，完整事实 | `19a95677-4304-4d3f-9ec0-51d3a704dff9` | 1 条有价值修改，保存；66.826 秒；实际浏览器采纳/刷新后导出此次 PDF |
| 1e263d2，门店经历 + 原有信息缺口 | `1c077627-f9bd-4cd7-bb98-3f50202c6596` | 嵌套质检协议仍无效，94.764 秒，未交付、退回预留；没有再生成正文冒充修好 |
| **0edf9ff，同一门店样本定向重测** | `dc977099-3a1b-49cc-bb81-d14315f865e5` | **1 条安全修改保存，事实/整稿通过；86.735 秒；缺口单问** |
| **0edf9ff，完整事实重新生成** | `35dd0cb8-4b27-40ba-a6a1-54469ed4f03b` | **1 条结构性修改保存，事实/整稿通过；73.590 秒** |

完整事实样本把长句中的实际动作、清单交付/用途拆成两个 bullet，删除“很强产品思维、沟通能力、认真负责”等无证据自评；40 条工单、Excel、参与身份、交付用途、公司/日期不变。修改 ID `ai-change-1792655533037-0` 在最终浏览器实点采纳，数据库状态 accepted，刷新后仍是两条修改和另一段原有 bullet，原始 resumeText 未覆盖。

门店样本可交付部分删除空泛自评；“参与活动但尚未梳理个人交付”那条被事实门禁拒绝，保留原文并只问一个具体事实。实际发送“记不清了”返回 discuss、记录 skipped=1、已保存变化不变。最终浏览器又发送“先别改，请分两点解释”，真实回复为两点说明加一问，只有 conversation 调用、无额外编辑；刷新后讨论恢复，无裸露 Markdown 星号。

同一最终候选“其他辅导”输入区左下 Logo 模型菜单可打开、行高与价格展示保留，选实惠档后刷新仍显示该选择。简历逐问输入区原本没有同一个模型菜单，本轮不新增不参与路由的假入口。

原始运行元数据见 [QA traces](2026-10-22-review-repair-qa-traces.json)；调用时间/token 等见 [模型事件](2026-10-22-review-repair-model-events.json)。它们不是完整 Eval I/O，不重建旧运行；Trace quality 里的技术条件分不等于求职者能力或“100 分好简历”。

## 实际 PDF（不是只验预览）

本人在 Chrome 打印保存的真实文件位于 `.impeccable/review/resume-trial-20261021/基础简历.pdf`，49135 bytes，Chrome/Skia PDF m155、创建于 2026-10-22 00:42:56 PDT。一页 A4（594.96×841.92 pt），Tagged、未加密、无 JavaScript，SHA-256 `98c4b3c38f98fc8867e4106831f68d2adb47b175c4c3c4b31159d42a541d4e44`。

用 pypdf 提取文字、Poppler 150dpi 渲染后逐页目视：陈知远虚构材料、两段实习/日期/末尾技能、3 个 bullet 均完整，无裁切、重叠、乱码、空页、浏览器页眉页脚；空泛自评已删除，40 条等事实保留。PDF 来源是**1e263d2 的成功生成与实际采纳**，不是声称 final Trace 35dd 的逐字副本；最终 0edf9ff 只更改 reviewer 后端/测试，二者导出、模板及打印源码无差异。最终样本另独立做真实模型→浏览器采纳→保存→刷新验收。

文件副本和渲染存于 `.impeccable/review/review-repair-20261022/actual-chrome-export.pdf` / `actual-pdf-page-1.png`；最终浏览器证据 `final-adopted-refresh-chat.png` / `final-model-picker.png`。

## 旧数据与测试清理

上线前排除本轮唯一虚构 QA 后，六组与写入前相同：41 旧作答、36 原机会、8 原简历任务正文/答案/讨论/result；积分钱包 1、转入 1、预留 6。没有旧数据批量迁移、积分收费、兑换、真实账号改稿或凭据修改。

仅删除本轮创建的 `review-qa-20261022-…@example.invalid` 虚构账号：先核精确 UUID、邮箱、provider、昵称与 reviewqa 邀请前缀，确认 QA 钱包/转入/预留均为 0；事务清其 1 个邀请码、4 个机会与级联任务/材料、14 条模型事件、30 条产品事件、8 条测试额度流水及 1 条额度。只有虚构测试记录被永久清理；脱敏 Trace、调用统计与实际 PDF 已先留证。两个确实登录过的暂存源正常退出；最初诊断域本来就是登录页，未虚称也曾登录。测试页面关闭，旧邀请码实际 HTTP 400，无法再登录；本地私有会话文件与 helper 随后删除。没有换全站签名或触碰真人会话；无状态 token 不支持逐令牌撤销，不把本地副本销毁写成所有历史 JWT 均已被密码学撤销。

清理后按写入前相同算法，全量回读以下六组 **行数与排序 JSONB MD5 均完全相同**：

| 范围 | 行数 | MD5 |
| --- | ---: | --- |
| interview_answers | 41 | 9e144836009b5eb9bfe09dec0ac90d32 |
| coach_opportunities | 36 | 7fee44e6f315f400430e8704c41686d3 |
| coach_resume_tasks 的 id/answers/conversation/result | 8 | 15af16ac187eca351f6fbcbdd8b90449 |
| watcha_point_wallets | 1 | 85eaeedc085c755397fcc75efd7d4591 |
| watcha_point_transfers | 1 | d2bcb60e210fd22927e355a2a70de90b |
| watcha_point_reservations | 6 | 427b4e11537b32e2d2392dcdd8cbe18e |

## 未扩张范围

目录本人晚上处理；首页/工具栏/打印/模板的协作者在途文件未夹带。旧域到期不续。本轮不买服务、不改 OAuth/手机号配置，不重跑用户付费模型或兑换；不因两个新样本通过宣称未来所有网络超时、所有简历质量问题已永久消失。
