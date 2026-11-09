# F6：公开检索额度耗尽后的自主接续修复

## 范围与根因

用户要求修复这次真实失败，先 Trace 回放，再验改稿、HR、保存刷新与实际 PDF，通过后上线；不增加调用次数、不写死流程、不新增模型费，旧作答和积分不动。

源 Eval `7c9d6250-91ec-43b3-98eb-aa99c0e9d597`，Trace `9b2876f6-e0b4-4b9d-99c2-8df36dded95f`。线上 v4 的 12 次作者调用中，先完成原稿/JD/事实/方法读取及 2 次搜索、2 次抓取；共享的 4 次公网额度耗尽后，仍向模型提供 search/fetch，仅回 `PUBLIC_REQUEST_BUDGET`。同批次及后续共 8 次工具尝试被拒，最后 7 轮作者调用均重复搜索，最终没有正文、没有进入 HR 或保存。错误确实进了下一轮输入，不能归因于模型没收到回执。

## 只改变工具可用状态接线

- 单一实际计数源仍是原 F6 的 4 次公网请求，作者上限仍 12 次（含 HR 后回应），HR 最多 1 次。没有提高任何预算。
- 每次公开检索回执带剩余额度；第 4 次成功返回的证据完整保留，同时明确额度已耗尽、不可重试，search/fetch 都不可用。
- 下一次作者请求不再声明这两项已经无法执行的工具。read_file / write_output / render_pdf 的原描述保持不变；同批次过期调用被本地拒绝，不发额外网络请求。
- 最后一次网络失败、恢复已耗尽 checkpoint、旧预算错误也同步更新状态，不自动换服务、不付费兜底。
- 没有强迫“搜完就写”、没有固定读取或写作顺序。作者仍可自主读资料、写稿、渲染或回答信息缺口；既有 HR 自然语言点评回同一作者的机制保持不变，没有新增解析器。
- F6 system / 5 工具静态定义 / B05 / 原材料 / 模型选择和路由 / 事实身份与账号并发保护 / 保存计费未变。动态撤下不可执行的能力不等于换一个 Harness。

运行标识：`f6-origin-runtime-v5-public-budget-state`；健康端点增加 `publicBudgetContinuation: exhausted_tools_unavailable_keep_evidence`。原 system hash `93be16d69b9ba62fc28de3cf63bbad2fabfbdc8a16be053a694e0be0099775c4`，工具定义 hash `a893136a0e8485564aab9c5f62d85f3551df25ec2482a1ffbfcb89e4d401ca8d`。

## 验证与证据边界

1. 改前：逐字回放真实 12 轮作者输出、全部工具回执及请求上下文，复现 `F6_AUTHOR_CALL_BUDGET_EXHAUSTED`。无新模型/联网调用。
2. 改后：真实 Trace 前 5 轮选择保持原样；后 3 轮是明确标注的确定性接续，复用同原料的旧真实模型成稿 `origin-final.md`，HR 使用明确标注“非新模型评审”的夹具。实际运行生产 writer、工具执行、程序校验、HR 接续和 PDF 渲染代码，验证证据保留、耗尽工具撤下、同作者可继续读/写/回应。8 个模拟作者响应 + 1 个 HR 夹具，**不冒充新的自主模型行为或稿质验收**。
3. 正式 POST 回归：额度耗尽 → 继续交稿 → HR → 同作者回应 → 一次完成/保存/额度结算。Mock 上游，不调用真实付费服务。
4. 实际云端与浏览器：新建明确命名“F6 搜索接续回放 / 零费用保存与PDF验收 · 非新成稿”的账号内隔离副本，用实际完成 RPC 保存回放稿；真实登录页面采纳、刷新、读回。正文逐字一致，HR 状态/原文保留；错账号读取被拒。没有覆盖失败原任务。
5. 产品导出按钮 → Chrome 原生另存 PDF：2 页 A4，44 段全部找到且顺序正确，0 替换乱码、无打印工具栏泄漏；两页图片已逐页目检。PDF SHA256 `0b41821ce25b2f79a77bacd9054ff08681858f2416b0b80077f343a426005d8b`。这是实际产品导出，不用工具渲染冒充。
6. 原任务/原机会全字段及钱包、积分/配额四表前后哈希一致；副本旧回答也未变。新上游模型调用 **0**，新模型费用 **¥0**。旧运行费用估算不等于实扣或已退款。

隔离副本 opportunity `d68f5684-884a-4a88-9e34-119da13060c2`，task `8c6e1353-fbba-42d6-92f0-d3408e09252a`。成稿 SHA256 `79feef8968f0c2ce0ebf738c027ec45d2d6dc3770f89b47a18e2d9bc376a60e8`。

私有证据目录（含本人材料，不部署/不提交）：`/Users/yi/Documents/Codex/yizhi-f6-production-audit-20261108/`。

- `public-budget-before.json`、`public-budget-after.json`、`public-budget-replay-trace.json`
- `public-budget-cloud.json`、`public-budget-cloud-verified.json`
- `public-budget-product-export.pdf`、`public-budget-product-export-check.json`、`public-budget-product-page-{1,2}.png`
- `public-budget-browser-verified.png`、`public-budget-npm-test.log`、`public-budget-build.log`

## 回归

- 全量正确命令 `npm test -- --runInBand --silent`：354 suites / 3342 tests 通过，7 suites / 12 tests 按既有设置跳过。
- 定向 5 suites / 31 tests、正式入口 87 tests 通过；tsc、定向 ESLint、diff check、本地生产 build 通过。
- 初次直接用 npx jest，漏 package script 的 NODE_OPTIONS，造成一条 PDF 测试失败；失败日志保留，换正确仓库命令后全量通过，不删失败记录。
- 未修改 UI 文件，不做与本次无关的 UI 重设计/扫描。未引入备份恢复或未验 Harness 包。

## 未扩大的历史问题

可选 render_pdf 工具的旧基础排版器仍会显示原始 Markdown 链接、PAGEBREAK 注释并出现孤立标题；此工具的 PDF 已真实生成并记录，但不宣称视觉排版通过。本次实际用户“导出 PDF”使用另一条既有产品打印路径，已实际验过且无这些问题。没有在搜索修复中顺手重写排版器。

没有重新付费生成或新 HR 评审，不能据此次零费回放宣称新稿质量更好、所有后续模型必然交稿或整个 F6 已无问题。上线验收针对本次确定的接入缺陷及其回归。

## 发布

待 staged-production 同构建健康核验后，按用户授权 promote；切换前正式为 `e50050e` / `dpl_42Cf73nLbuYjZK7LYfgCuCk43YfL`，作为本次回滚点。
