# 原账号模型超时链路核验

2026-10-20 本地 / 2026-10-21 UTC。本人明确授权最多两次原 TokenDance 模型测试：短回复一次、实际导师输入一次；不自动重试、不执行编辑、不写旧作答、不动益职积分。

## 结论与证据边界

当前生产版本在本人实际账号链路上两次均通过，不再以独立 QA 的 StepFun 成功替代本人 TokenDance 验收。两次通过不证明原来那次超时已被永久根治。原事件只留下 SDK 通用 timeout，历史运行日志查询未返回可用错误堆栈，无法确认当时是连接超时、网关还是供应商等待；不能凭 10255ms 就归因于 10 秒连接限制。

实际链路：原登录账号 → 私有 TokenDance 连接 → 模型目录解析 → TokenDance gateway/v1 → deepseek-v4-flash → 内部流式接收完整 JSON → 导师决策校验。当前连接 active；旧默认模型仍在真实目录 hosted 中，未静默改成新版本或站点模型。公开目录成功本身不证明生成鉴权成功，下面两次才是生成实测。

原失败 Trace `35d45ca9-1737-4d9d-8f5d-8cfb7a41a631`、span `b0bb4f54-1bee-49ba-bc17-0d6694f4ee4e`、消息 `97c14236-a978-47cf-8da1-1963f5b758bc` 保持原失败与空输出，没有回填成成功。原调用10255ms、retry_count=0；同账号此前改稿成功请求有超过10秒的记录，因此未贸然调大45秒总期限。

## 本轮变更

- 在 SDK 丢失 native fetch cause 前记录白名单错误代码、HTTP 状态、连接/收取阶段、首内容时间、请求次数、实际提供方及模型；不记录 URL、请求头、原始错误文本或密钥。失败没有 usage 时也能保留路由证据，仍不把未知 token 写成供应商未收费。
- 生产完整流/JSON 结束后才接受结果，45秒总期限、30秒首活动期限保持；maxRetries=0，不自动更换提供方。上轮已接内部流式，本轮新增诊断与成功后清除外层 deadline 定时器，不把后者冒称原超时根因。
- 新增仅本案的管理员只读诊断入口，要求同时为原 Trace 所属账号；仅接受 short/mentor 及费用确认，不接受自选身份、模型、材料或任务 ID。每类探针固定 ID、数据库唯一键先占位，重复/并发请求不会再调用模型；窗口2026-10-23 00:00 UTC截止。两名额本轮已使用。未授予新管理员权限、未导出账号密钥。
- 实际模型密钥只在原服务器读取，不经本机或聊天。诊断只写新增 Eval/模型遥测，不调用任务 begin/complete、编辑 Agent、额度预留、兑换或积分扣减。

## 两次真实调用（已存正式后台）

| 探针 | 新运行 ID | 实际提供方/模型 | 上游调用耗时 | 诊断总耗时 | 首内容 | token | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 短回复 | 08859ae8-3656-59fb-a1a9-e68608c6e510 | tokendance / deepseek-v4-flash | 2231ms | 6532ms | 2062ms | 13 / 5 | completed，JSON ok=true |
| 原导师输入 | 3ee75ad7-f410-5d1f-ae90-9ded1a43d7bf | tokendance / deepseek-v4-flash | 8367ms | 12749ms | 2839ms | 6093 / 438 | completed，discuss，editorExecuted=false |

两条 `ai_generation_events` 各一条 success，retry_count=0；传输 attempts=1，HTTP200。没有第三次测试。价格估算与实扣金额均未知，未编造实际费用。`transport.elapsedMs` 在此版本包含模型遥测保存等待，分别3040/9228ms；表中上游耗时取生成遥测的 latency_ms，整条耗时取 run.durationMs，避免混淆。

第二条模型 messages 与原失败 span 的 messages，经数据库 JSONB 等值比较为 true（保留原采集时的凭据脱敏，不重新构造历史内容）。新 run.input 分别保存 sourceTraceId/sourceSpanId/inputSha256；完整真实输入输出在新 span。模型确实回应了亮点与开头密度问题，并先讨论取舍；诊断不把其决策写回原任务，也不启动改稿。

Chrome 使用原管理员会话、新域同源开发请求，未导出 Cookie。正式 Eval 刷新后两条新记录均可读，原失败仍在；Agent I/O 看到实际输入输出，输入页看到来源编号。未请求额外 LLM 自评。安全截图 `/tmp/yizhi-own-chain-diagnosis.qTtIcJ/owner-model-eval.png` 只含诊断元数据，不含简历联系方式。

## 数据保护核验

测试前后同一只读 SQL：整行文本按整行文本排序，string_agg 分隔符为空；此口径与旧报告不同，不拿跨口径 hash 当数据变动。

| 对象 | 行数 | 前后相同的 MD5 |
| --- | --- | --- |
| interview_answers | 41 | 4e13749d834d65ba1213c5da9faedd54 |
| watcha_point_wallets | 1 | 911203ce80ef77ab10df3a333e393dab |
| watcha_point_transfers | 1 | 772e13a5cd6cb3bc100c6caf337f56da |
| watcha_point_reservations | 6 | d9074173be468ca74a52a9f975befdfd |
| 原 coach_resume_tasks 整行 | 1 | d39190381527752759d86f08c178e048 |

原账号、原任务、旧作答和积分未改。未重测或操作 PDF、短信、支付与积分兑换。

## 验证与上线

- 7套52项定向回归通过，类型检查通过、相关 lint 无错误。覆盖 native cause 脱敏、流式截止/清理、TokenDance 接线、原账号归属、CSRF/费用确认/超期拒绝、稳定ID不重复调用、无站点回退及即使 revise 也不执行编辑。未声称本轮全项目测试。
- 后端任务，未改UI，不启动 Impeccable 自动钩子或扩大扫描。首页、作战盘、对话UI、打印等协作者在途文件不入包。
- 运行代码 `a337661`，从干净 git archive 构建 `dpl_2yQL8K6cTdjxjZMPTwvqvix4Xi4T`；136页/TypeScript/READY。Vercel API 回读 projectId=`prj_fav7gQZKEEE2JO3b8v9S9leeRhkS`、target=production、meta.sourceCommit=a337661。
- 候选经现有 Vercel CLI 认证核验 health200/databaseok、诊断匿名401，未关闭部署保护。原正式仍 urit… 后同构建 promote；正式 yizhioffer.com 回读为2yQL…/READY，health200/databaseok、诊断匿名401；上述两次真实调用均在此已上线构建。
- 仍不宣称原一次性超时的底层根因确定、长期可靠性完成或供应商永不超时。今后真实失败可保留具体传输层证据，无需靠重复花费和猜测定位。
