# 2026-11-09 重新改稿瞬间返回旧稿：启动与回执修复

## 用户反馈与证据边界

用户点击修改后立刻收到完成提示，正文没有变化。只读核验本人的事件、任务和 Eval：15:02 UTC 左右存在改稿接口成功响应，客户端约 791ms 读完；任务仍停在 14:24 的旧 ready 版本，没有新的生成/Eval。Vercel 日志可见 PATCH 保存、POST resume-agent 和任务 GET，但不含 POST 请求体，不能声称直接观测到了 action=start。

代码与零费用回放复现了同样结果：前端用尚未加载的任务推断 start；服务端在已有 ready 任务时按幂等规则返回旧结果及 replayed=true；前端忽略 replayed，仅凭 ready 就显示“修改已保存”。这是新任务未启动和回执误报，不是模型判断无需修改。

## 修复

1. 用户确认“重新修改整份”明确发送 restart，不再猜异步读取状态。服务端现有并发租约/CAS 保留，运行中请求不重复开启；导师“继续/重试”仍走 retry，已存补充不清除。
2. 提取 resumeRequestFeedback：区分旧结果、仍在运行、待补充、无改动、未确认保存、部分交付和新建议已保存；旧 ready 回放不能冒充新生成或模型无改动判断。
3. 保留模型选择、聊天、全部 F6 + HR 编排、事实/身份边界、保存和计费。生产服务端实现未改。

## 验收

- 实际路由 + FakeDb 的 claim/CAS/GET 回读：旧 start 原样返回旧稿且不调用编辑；新 restart 无需先 GET 即领取新代次；并发两个 restart 只调用一次；运行中回放不能报完成。付费生成与最终持久化被替身取代，不称真实模型或生产数据库 E2E。
- 反馈单测覆盖 replay、running、needs_detail、failed、idle、空结果、unchanged、未确认保存、部分交付、讨论和跳过。
- 全量 Jest：358 suites / 3363 tests 通过，7 suites / 12 tests 按既有配置跳过。
- 类型检查通过，定向 ESLint 0 error，CockpitApp 3 条既有 unused 警告；git diff --check 通过。
- 实际 CockpitApp live 分支的 development-only 本地传输夹具：初始任务 GET 人为挂起；取消不发请求；确认发送 restart；先显示正在修改，再显示新正文和修改高亮。另测强制旧结果回放，旧正文不变并明确“本次没有生成新稿”。所有 API 为本地替身，未接生产数据库/模型。夹具 SSR query 差异已修成服务端 prop；复核无 hydration 异常。浏览器扩展错误及本地根级遥测 503 不冒充业务链路错误或验收通过。
- Impeccable 手动 detect 一次，3 条颜色建议均在本次未改行；未扩大处理，自动钩子未开启。
- 私有原始记录和虚构截图存本机审计目录，不入仓库。

## 发布边界

代码 `1ffc2f5` 已推送原发布分支；本地 Next.js 16.3.0 webpack 构建成功（BUILD_ID `dpXuNP4me6KrZ86IztcrK`），Vercel 云构建约1分钟成功。先以 `--prod --skip-domain` 创建候选并核验，再 promote 固定 URL；没有直接盲切正式。

- 部署 `dpl_BZKFYrFowVQ7iLeKfXdaYR5yyjzT`，production READY。
- 固定地址：<https://ai-job-coach-1ojd3w0ik-velmavalienteqejimu22-jpgs-projects.vercel.app>。
- 2026-11-09 15:25 UTC，<https://yizhioffer.com> 与 www 独立 inspect 同部署；部署 Git SHA 确认 `1ffc2f5`，项目 ID 核同。
- 首页/登录200，匿名工作台307，匿名改稿POST401；开发夹具匿名先被登录保护307，真实登录后404，未开放测试入口。
- health database ok；F6 v5、原system/工具SHA、五工具、12作者/4公网/1HR及模型选择全与上一正式版相同。
- 正式登录态只打开“重新修改整份”确认窗并取消，弹窗关闭；DeepSeek V4.1 Flash选择与导师输入存在，没有提交生成。
- 回滚地址保留上一版 `ai-job-coach-dtnkes67p-velmavalienteqejimu22-jpgs-projects.vercel.app` / `dpl_2UM4yiNZWiuwb69JvjM88SYmhwjV`。

私有 `restart-candidate-verified.json` / `restart-live-verified.json` 为复核结果。0 新模型调用、¥0；不改原简历、旧作答和积分。此修复证明启动/回执分支，不宣称新模型稿质或新的真实付费整链路已经验收。
