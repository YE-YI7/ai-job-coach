# 2026-10-30 · 简历修改引用到对话：实现与验收

## 交付状态与范围

独立分支 `codex/resume-quote-reference-1030`，从正式发布提交 `2eb3024` 起，只接引用定位、现有导师消息持久化和必要回归。没有合入 `yizhi-harness-facts-context-1029` 的 B05/S01–S04 调优包，也没有连续性/备份恢复 A 包。本轮没有发布、没有执行真实模型测试。

本人对六列稿的评价是“可以先推进，但仍不够好”。B05 `resume-boundary/v0.7.0-B05` 保持冻结，不增加边界 Prompt；字数失衡、冗余口语、痛点与个人贡献提炼不足继续保留为回归问题，不改写历史失败为通过。“Prompt 到顶/上下文不足”仅为待测假设。下一建议变量为相同贡献事实的组织与采用，先冻输入差异再试，不在本轮调用模型。

## 用户路径

黄色/红色改动 → 原“采纳/保留原文/自己改”浮层中的“引用到对话” → 保留当前草稿，显示原文与建议并聚焦导师 → 用户主动发送 → 现有导师讨论/判断链处理。

- 点引用不自动发送、不采纳/拒绝、不启动改稿。只引用未写消息时，主动发送采用“请解释这处修改。”，不默认授权改稿。
- 引用和定位为确定性代码，零额外模型调用/零单独扣费；主动发送后的正常导师回复仍按原对话计费，引用上下文有正常输入 Token，不承诺整个导师回复免费。
- 当前粒度是现有 `changeId` 对应的一处修改及完整 before/after，不是任意字符框选。原文是原稿中可唯一解析的实际片段，坐标为 `.trim()` 后的服务端规范原稿 UTF-16 `[start,end)`。

## 确定性定位与证据边界

指针包含 `opportunityId + revision + changeId + sourceHash + changeHash`。哈希为 SHA-256，后端重新读取当前用户拥有的岗位/简历，解析唯一原文区间后比对版本与哈希。重复同句、重叠建议、旧版本、源文/建议/决定变化或跨岗位都拒绝，不做模型/相似句猜测。

客户端 sessionStorage 只留账号+岗位隔离的 ID/哈希指针，不存简历原句。刷新时读当前稿重新校验；错误可见，草稿保留，可移除或重新引用。发送失败不清引用，成功后仅清掉对应的旧引用，避免清除用户刚选的新位置。

有简历任务时，引用进入同一条 conversation 收据；无专用任务时，进入原普通导师 pending metadata / learning_trace。复用现有 JSON 字段，不新增 SQL、表、Auth 或 RLS 权限。用户发送后仍按原决定 `discuss/revise`；引用的 AI 建议不是用户补充事实，原编辑只在既有决定准许时接收源文锚点和位置。

同请求 ID 的引用不能被更换。已存回复先按原指针恢复，不因当前稿后续变化再次扣费；新请求的引用在计费包装前核验，迟到的专用任务提交前再次校验。

## 验收结果

- 全量 Jest：317 suites / 3061 tests passed，既有 5 suites / 10 tests skipped。使用标准 `npm test -- --runInBand`，没有绕过收费/持久化测试。
- `tsc --noEmit` 与生产 `npm run build` 通过；定向 ESLint 0 error，CockpitApp 3 条历史 unused warning。
- 新增 18 条运行测试：唯一定位/哈希与版本/跨岗位/重复与重叠；专用消息保存读回/原编辑锚点/事实边界；普通导师原有单次调用拿到引用；异常引用在模型和上下文检索前拒绝；pending 恢复；同 ID 重放及换引用冲突；异步恢复/定位迟到不得盖新引用或在移除后重新出现。模型与库均为 mock/FakeDb，不冒充生产实测。
- 更新 4 条旧回归断言：新参数仍保留模型选择；输入框引用不挤出发送按钮；仍按原 ID 重试；引用不把聊天消息默认变成经历答案。
- 本地浏览器实际点击：红色/黄色引用、点击不自动提交、失败保留、草稿+指针刷新恢复、成功后清引用、账号/岗位隔离、当前稿更新后拦下旧指针。390×844 无横向溢出，移除引用按钮 44×44。
- 上述浏览器发送是明确标示的虚构夹具回执，提交计数与模型调用 0 分开显示。真实产品 `studio` 预览是只读状态，未在真人登录态写消息，未据此宣称生产导师/云端端到端验收。
- Impeccable 手动一次扫描＋一次修复复核：0 主问题；新引用组件使用现有调色板，剩余 3 条 CockpitApp 颜色 advisory 均为未改动的历史行。未开启自动钩子。

本轮没有调用真实模型、短信、支付、积分兑换或真实简历更新；旧作答/积分未写入。FakeDb 回归断言旧面试回答与余额保持不变，不把这个断言说成已查询生产余额。没有打印代码改动，也没有新增实际 PDF 验收声明。

## 证据与复验

私有证据目录：`/Users/yi/Documents/Codex/yizhi-qoder-ui-release-20261030/`，本轮日志统一前缀 `quote-`，不与前一轮 UI 发布证据混淆。

- `quote-full-jest.log`：首次全回归 4 条旧源码断言失败，保留原失败记录。
- `quote-full-jest-final.log`、`quote-tsc.log`、`quote-lint.log`、`quote-build.log`：最终门禁。
- `quote-impeccable.json` / `quote-impeccable-final.json`：扫描和复核。
- `evidence/quote-popup-desktop.jpg` / `quote-final-desktop.jpg` / `quote-mobile.jpg`：实拍。

本地仅 development 的虚构演示页：`/cockpit/preview?resumeQuote=1`，生产继续 `notFound()`。可以用 `npx next dev --webpack --port 3372` 启动。请勿在同一 `.next` 目录并行运行 dev 和生产 build；构建前先停止本任务 dev。

## 追加：本人明确批准后完成真实登录态验收并独立上线

先前“未发布/只模拟”的段落是前一阶段记录，现由本段更新状态，不覆盖原验收边界。

- 正式代码：`175d2c1099f121e18e858d909feab30ce9557a36`，分支 `codex/resume-quote-reference-1030` 已推送。精确 SHA 的 GitHub [41053438778](https://github.com/YE-YI7/ai-job-coach/actions/runs/41053438778) 全量回归与隔离 schema 两项 success。
- 项目/团队 ID 与上次正式相同。`production --skip-domain` 生成 `dpl_CSKuTqsCpRboMcieDdBLcgn65TyC`，候选 READY、无 alias，API 元数据精确对应上述 SHA；候选健康数据库 ok、匿名简历任务 401。
- 新建两位虚构 QA，经原邀请码登录接口正常签发会话，不借真人 Cookie、不伪造用户会话、不改变 Auth/RLS 或收费。只有 QA 岗位预置一条明确虚构的建议及 ready 任务，不跑整稿或把它冒充质量验收。
- 浏览器在候选实点黄色引用 → 输入问题 → 刷新 → 重新打开“我的简历”后原文/建议/草稿恢复 → 主动发送一次。真实导师返回 discuss，消息、引用、回复写入云端；再刷新和独立 GET 都读回相同内容、改动 ID、源位置。原简历/建议和 task.answers 不变，未启动编辑。
- 普通导师链另一次真实请求验证 pending 指针保存、刷新 GET、引用及回复持久化；同 ID 重放返回原 turn，没有重新生成。第二个正常鉴权 QA 账号读/发别人的任务 404；读取别人会话无数据。错误源哈希及原 ID 改绑引用 409，模型事件和 QA 额度前后不变。
- 390px 真工作台点红色引用可打开现有导师抽屉，仍待用户发送、无横向溢出。模型选择弹窗可打开，保持自动档；渐进 Markdown 聊天沿用原实现。
- 本轮实际 2 次站点 StepFun / `step-3.7-flash` 成功调用，输入合计 8579、输出 960 Token。没有自动重试/编辑调用，未使用真人 TokenDance 或真人益职积分；未估造实扣费用。
- promote 同一生产构建后，`https://yizhioffer.com` inspect 确认为 CSK/READY，健康数据库 ok；正式域名正常鉴权读取同一专用/普通导师引用与回复，新增模型事件 0。上一正式 DoDT 保留回滚，未混未验 Harness/S04/备份 A。
- 原六列所属账号 7 组前后 SHA-256 完全相同：20 岗位、14 简历任务、34 普通导师记录、1 额度行、2 扣额账本行、8 面试、16 原作答。本轮没有写这些原有记录。近 10 分钟有界部署 error 日志 0 条，不等同长期零错。
- 两个测试账号标为 `qa`，仅其事件追加 internal/is_test/qa，按已有统计规则排除。候选浏览器 QA 已退出，两条本次临时邀请码已移除，云端 QA 消息/模型记录保留作证据；未删除旧用户、旧作答或积分。

新增证据：`quote-candidate-api.json`、`quote-ci.json`、`quote-cloud-api.log`、`quote-cloud-ui-readback.log`、`quote-cloud-guards.log`、`quote-cloud-acceptance-result.json`、`quote-formal-readback.log`、`quote-live-after.json`、`quote-release-errors.jsonl`、`quote-invite-cleanup.log`；真实桌面/手机截图在 `evidence/quote-cloud-*`。私有测试状态 0600，不进 Git；测试记录不是 B05 强稿或 S04 语义验收，不改变这些失败结论。
