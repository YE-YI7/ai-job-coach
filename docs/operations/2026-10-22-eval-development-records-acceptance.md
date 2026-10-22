# Eval 开发记录：正式归档与验收

2026-10-22（America/Los_Angeles）。本次只扩展管理员 Eval，不重新调用模型，不改用户原稿、旧作答、积分或兑换，不并入 Cursor/DS 的在途首页、工具栏和打印文件。

## 可直接查看的正式结果

- 入口：https://yizhioffer.com/admin/evals/records
- 本次记录：https://yizhioffer.com/admin/evals/records?record=f1ca9092-09a4-4ed5-8d4b-29ab58c2d32f
- 最终输入输出定位：同一链接追加 `#final-product`。
- 标题：简历质检返修闭环 · 真实验收与上线。
- 正式代码 `0bdaafa6f9212276e93d87bf8d85d2ec2caa39e5`，Production `dpl_E3MjDgmagEMXJSn1qYbFiqMLYLWN`，干净归档构建后 promote 同一已检查 Production 构建；正式域名 inspect 回读 READY。上一正式 `dpl_JAMTV6ieWpFwvtuTUjn6NWcVZq96` 及历史稳定构建均未删除。

新入口在现有 Eval 页头和侧栏各一处。页面按输入输出、质检失败、返修过程、交付验收、上线结果筛选，块目录支持锚点链接；搜索支持功能、版本、Trace 和修改 ID。当前列表明确只取最近 30 条，不宣称全库分页搜索。

## 已存储的证据与边界

现有私有 `coach_eval_runs` 中新增且仅新增一条 `recordType=development_log` 的归档，与运行记录列表分开。没有建新表、改 RLS、改管理员名单或增加存储订阅。归档正文及 PDF 约 100 KB；列表只读索引元数据，详情剥离附件 base64，PDF 单独通过管理员接口下载。

归档含 10 块：失败原因、中间失败样本、返修机制、最终完整事实样本、最终带缺口样本、中间成功稿与 PDF 来源、诊断单经历样本、保存刷新与 PDF、导师逐问、上线与数据保护。索引关联本轮 5 条真实生成 Trace 和前轮失败 Trace，共 6 个真实 Trace ID；已独立留存的真实修改 ID 为 `ai-change-1792655533037-0`。其他当时未独立留存的修改 ID 明确缺失，不补造。

历史完整模型请求/回复未捕获，原隔离 QA 已按前次清理要求删除，不能恢复。测试夹具、实际修改摘录、真实阶段/模型调用元数据、源码机制说明和未捕获 I/O 分别标记。成功原编辑返修路径由确定性回归证明，不伪装成本轮发生过的真实模型消息。失败的旧 status 原字符串和中间嵌套错误字段未知，原因说明区分控制流判断与直接观察。

此次保留的实际 PDF 来源为中间成功稿 `19a95677-4304-4d3f-9ec0-51d3a704dff9 / 1e263d2`，不是最终 `35dd0cb8…` 的逐字副本。最终版只调整 reviewer 后端/回归，打印源码未变；此边界已写入后台，而不将附件冒称最终文本。

## 正式归档方式与回读

Chrome 本地文件上传被扩展的 file URL 权限拦截，未扩大扩展权限、未声称 UI 上传成功。既有登录会话的只读 `/api/auth/session` 核对当前管理员确为原记录拥有者；该接口仅返回身份 ID/邮箱，不读取或导出 Cookie/令牌。随后使用已授权项目连接，执行同一 `parseEvalRecord`、脱敏、附件摘要与 `recordIndex`/`recordHash`，只插入该记录，冲突 `DO NOTHING`，不更新旧行。`archiveSource=authorized_project_connection` 如实保留导入来源，而不伪称经 UI 写入。

- 数据库存档时间：`2026-10-22T09:00:46.562067Z`。
- archiveHash：`9138012147f082d58980e5ba250fb3d9ff9a98bb32fef9d277d40e7087e09a44`。
- 正常管理员登录正式页，刷新后实际回读同一 ID、10 块、真实 Trace 和修改 ID；修改编号搜索＋输入输出筛选只留下 `final-product`，左右对应输入夹具与实际修改摘录。
- 锚点地址刷新后仍定位 `final-product`，再次从后台读取而非本地 fixture。
- 实际点击受保护附件下载到 `Downloads/益职返修验收-实际Chrome导出.pdf`，49,135 bytes；本地原件、数据库解码附件、正式下载三者 SHA-256 均为 `98c4b3c38f98fc8867e4106831f68d2adb47b175c4c3c4b31159d42a541d4e44`。
- 正式匿名 health 200/database ok；记录、附件和原 Eval API 均 401。非管理员 403、同源写入、冲突不覆盖、大小/字段/UUID/附件门禁均有回归验证。

“存档 JSON”服务端 POST 的成功、幂等/冲突/错误路径由回归覆盖；因本地扩展上传限制，本次不宣称该按钮已完成正式自动化上传验收。新记录的实际持久化、正常登录回读、刷新和文件下载已完成正式验收。

## 检查与发布门禁

干净归档：7 套 36 项定向回归、`tsc --noEmit --incremental false`、限定文件 ESLint 通过；云端完整构建通过，静态生成 139/139。共享脏树的 `ResumeProcessingReceipt.defaultOpen` 类型问题属于协作者在途文件，未修入或带入本构建。

Impeccable detect 仅一次，范围为本次 TSX/CSS 和新增入口的 HTML。结果为 Eval 字体别名/系统字体与设计文档的差异、选择/焦点色及字号 advisory、旧 Eval 页颜色/圆角差异；没有扩展清理旧 UI。独立 finish review 发现重复选择当前行会清空后卡住、空列表持续读取两项；`0bdaafa` 修复后，桌面/窄屏实际重复选择均保留 10 块及已读取状态，空列表结束加载，两项 verdict 均 resolved，disposition ship 仅覆盖这两项确认。普通扩展 documenter 保留共享 DESIGN.md 和 sidecar，只更新本次 surface brief。

窄屏请求 viewport 390px，截图内容宽 384px（滚动条占位）；实际页面 `scrollWidth=384 < innerWidth=390`，未见页面级横向溢出。图片是 QA 证据，不是上线视觉资产：

- `.impeccable/review/eval-records-20261022/desktop.png`
- `.impeccable/review/eval-records-20261022/desktop-full.png`
- `.impeccable/review/eval-records-20261022/mobile.png`
- `.impeccable/review/eval-records-20261022/desktop-confirm.png`
- `.impeccable/review/eval-records-20261022/mobile-confirm.png`
- `.impeccable/review/eval-records-20261022/empty-confirm.png`
- `.impeccable/review/eval-records-20261022/production-product.png`

暂存初版 `e545729 / JD1oN1y…` 未 promote；最终修复版 `0bdaafa / E3Mj…` 才晋级。暂存受 Vercel 保护，采用现有 CLI 登录和明确项目/团队绑定检查 health 200、应用 API 401、页面 307；未关保护、未导出凭据。CLI 56 的 curl 会将 `--scope` 误传给原生 curl，改用已核验 `.vercel/project.json` 加明确 `VERCEL_ORG_ID/VERCEL_PROJECT_ID` 后检查成功，不将命令参数问题当成产品失败。

## 数据保护

操作前后同一排序 JSONB MD5（任务按 id/answers/conversation/result 内容口径；其他按整行）。仅多一条上述归档，旧 Eval 记录和人评也未更新。

| 数据 | 数量 | 前后相同 MD5 |
| --- | ---: | --- |
| 旧 interview_answers | 41 | 9e144836009b5eb9bfe09dec0ac90d32 |
| 原 coach_opportunities | 36 | 7fee44e6f315f400430e8704c41686d3 |
| 原简历任务内容 | 8 | 15af16ac187eca351f6fbcbdd8b90449 |
| 积分钱包 | 1 | 85eaeedc085c755397fcc75efd7d4591 |
| 积分转入 | 1 | d2bcb60e210fd22927e355a2a70de90b |
| 积分预留 | 6 | 427b4e11537b32e2d2392dcdd8cbe18e |
| 原 Eval 记录（排除新增 ID） | 107 | 7e8a18d033f9d6f0a6c36ad2d3c08542 |
| 原案例反馈 | 7 | a08a6b761bd094332c60ed07e0cdb813 |
| 模型事件 | 785 | 25555dbb0ce1619f14134635cbda8172 |

无新模型、短信、充值、积分兑换、旧作答或旧资料写入；未恢复已清理 QA 或任何临时凭据。旧域到期不续、目录由本人处理、协作者 UI 独立验收等边界不变。
