# Today 与首页演示：现有界面修复及正式发布

2026-10-25 · Codex。用户授权在现有界面上修复并上线；不重做晨光设计，不覆盖其他工作树，不动旧作答和积分。

## 发布结果

- 正式域名：<https://yizhioffer.com>，已由 Vercel 别名回读及正式浏览器确认。
- 运行提交：`1e3277f8e8b39f4f55680d175c71c3d16c75d687`，分支 `codex/qoder-today-experience-1024`。
- 发布构建：`dpl_EefmVbx2xNi9fx1h3o1EB49Q1bEd`，即已验收的 Production skip-domain 构建，同构建 promote，没有再构建后直接放行。
- 上一正式构建 `dpl_A1YBK9obz22G39JEYVCqW9DTSDFA` 保留；没有删除旧稳版。
- 正式 health：`ok: true / database: ok`；登录页返回 200。没有重新做真实 OAuth 或短信验证，不把 HTTP 200 当成登录全链路验收。
- 运行提交与后续证据文档提交分开。分支自动部署关闭、CI 保留，避免推送文档悄悄替换刚验收的构建。

## 修复与范围

采用 Qoder 的 Today、面试反馈和晨光内页包，在同一独立工作树修三处阻断，不整包发布旧共享树。

| 问题 | 原因 | 修复与回归 |
| --- | --- | --- |
| R01 无岗位用户一直加载 | effect 将自己写入的 loading 状态当依赖，下一次 cleanup 提前失效正常 HTTP 回包 | 提取 `useTodayCompanion`，生命周期按 enabled/scope/revision/fallback 管理；卸载中止、晚到结果隔离；15 秒读超时进入可恢复错误，仅手动重试 |
| R02 无岗位目标串到当前岗位 | `null ?? activeId` 把明确无岗位变成默认岗位，导师目标也随之串台 | 区分未知来源、明确 none、岗位 ID；切 scope 当次隔离旧计划；父界面给导师传递明确的无岗位上下文 |
| R03 返回 Today 仍显示简历编辑器 | activeTab 保留 resume，专用 resumeContext/workflow 没有受 surface 限制 | 两个专用条件均限定 opportunity 界面；切回简历仍恢复原任务、消息和未发送草稿 |
| 首页面试热区错位、批注串场、导航遮标题 | 原截图坐标与当前图不一致；跨章节共享批注列表；sticky 窗口没给导航留位 | 择入首页 `59f378b` 补丁（本分支 `c5fe36c`），重锚热区、保留各章真实 DOM/事件、隐藏 pane inert、离开面试停止回放、桌面/手机留位 |

源提交依次为 `481201e`、`c5fe36c`、`1e3277f`。保留输入区左下角 Logo 模型菜单、既有聊天体验与简历功能；没有修改收费规则、积分兑换、鉴权业务、简历打印实现或旧数据。Qoder 面试反馈的取消说明仅信服务端状态，不宣传“点击就立即停算或免费”。

## 真正执行的验收

### 自动门禁

- 完整 Jest：304 suites / 2963 tests 通过，5 suites / 10 tests 按既有配置跳过，无失败。
- 新增实际 React 挂载的异步读取测试 10 条：延迟回包、401/503/网络失败、手动重试、卸载与重新挂载、A→B 失败不串 A、明确无岗位回退、同 scope 失败保留自己的已确认内容、禁用等。
- Today 父界面/专用编辑器还有源契约测试；不将它们冒充完整组件 E2E。
- `tsc --noEmit` 通过，定向 ESLint 0 error，3 条 CockpitApp 历史 unused warning；本地完整生产构建通过。
- 精确运行 SHA 的 [GitHub Actions 40176301177](https://github.com/YE-YI7/ai-job-coach/actions/runs/40176301177)：`deterministic-and-archived-replay`、`isolated-schema-rebuild` 均 success。
- 本机 `schema:verify` 曾因 Docker API 500 失败；保留这一环境失败，不假称本地过，也不因此改正式 SQL。上面同 SHA 远端隔离重建成功。

### 实际浏览器与云保存

只使用本轮新建、`example.invalid` 的虚构 QA；没有使用本人真实简历或触发模型。

1. 云端虚构用户先无岗位：延迟读取完成并展示已有无岗位安排，不再一直加载。
2. 加入一个无安排的岗位：Today 正确回读原无岗位安排，不把它绑定到新岗位。
3. 存在虚构 needs_detail 简历任务：简历→Today 是通用导师，返回简历恢复原讨论与未发送草稿。
4. 展开模型菜单、选项刷新恢复；简历草稿刷新恢复。
5. 实际 iframe 手动编辑段落、保存后等待云端确认、刷新仍见 `UI-BROWSER-SAVE-1025`；正式域名独立 HTTP 再读并按产品真实投影核对通过。
6. 本地首页岗位→简历未决→面试→简历往返后，原接受按钮仍可点击并采纳；面试热区真实打开，导航不遮标题，滚动可离开演示。
7. 390×844 页面无横溢（文档宽 384）。正式桌面首页也回读并截图，快滚后返回面试会切到正确章节，能继续滚出到联系区。单次跨过整个章节不保证执行每个演示步骤，不将此当模型或产品面试实测。

### 保存验收中一个测试断言的纠正

首次独立 HTTP 断言误在不可变原文 `resumeText` 中寻找手改标记，失败。原因不是保存丢失：手动编辑在 `resumeChanges` 中，`accepted=true / editedByUser=true`，原始文本按设计保持不变。

修正验收脚本，使用产品的 `applyResumeChanges` 检查最终投影，同时断言原文未变，正式回读通过。实际修改 ID：`manual-2d39598e-9b17-4598-85a0-3c9c453c2b99`。没有修改产品实现来迎合断言，也没有覆盖旧原文。Eval 以新补充记录保留这次失败和纠正，不改写原档案。

### 新的实际 PDF

从长简历虚构夹具的真实“导出 PDF”→新基础简历页→“保存为 PDF”→Chrome 打印→系统另存，得到本次新文件，不用历史 PDF 替代。

- [益职Today修复验收-20261025.pdf](evidence/2026-10-25-today-repair/益职Today修复验收-20261025.pdf)，66245 bytes。
- 4 页 A4，24 个 `RESUME-CHECK-01…24` 标记各一次且顺序正确，结尾一次，无打印工具栏文本泄漏。
- 全 4 页逐页渲染并目测，无明显裁切；第 4 页因长文本压力夹具较空。不代表所有复杂简历或所有 ATS 都已覆盖。
- Qoder 已有六模板共 23 页 PDF 在前次独立审查中提字/渲染；本轮新导出文件补足真实系统另存流程，不宣称又重跑六套全部生成。

## Eval 可直接查看

- [正式验收记录（含保存口径补充）](https://yizhioffer.com/admin/evals/records?record=e66900cb-6fc8-472e-a92e-0ad558ea7f5a)：原因/修复、挂载回归、云保存刷新、首页、实际 PDF、发布保护，按块展开，PDF 可下载。落库后全文与 hash 回读相等。
- 原记录 [2e9a1a4b](https://yizhioffer.com/admin/evals/records?record=2e9a1a4b-87a5-4a63-8e8b-dc65faf4bb76) 不覆盖，补充记录明确引用并保留首次断言失败。
- 本轮模型调用 0，所以 Trace 为空；用 R01/R02/R03、首页修复及真实手改 ID 关联，不编造模型 Trace。

## 数据与凭据保护

- 对本轮新 QA 以外全部已有 `resumes` 16、`user_resumes` 16、`coach_opportunities` 37、`interview_answers` 41，以及积分 wallet/transfer/reservation 1/1/6 做按行规范化摘要；发布前后与清理 QA 后均逐项一致。行数不足 1000 的断言防止 REST 默认截断造成假一致；不输出私人原文。
- QA 事件仅按本轮新 UID 或精确候选域识别，23 条标为 internal，不混入正常增长数据；未全量重写历史埋点。
- 仅本轮虚构 QA 与验收档案产生写入；没有真人改稿、旧作答、积分或兑换动作，0 模型、0 短信、0 支付、0 正式迁移。
- 浏览器候选 Cookie 已移除；仅本轮临时环境/登录文件清理，未轮换共享密钥，也不退出本人原账号。最新短期测试 token 到期时间 `2026-10-25T08:57:43Z`；清本地文件不是服务端吊销，不能说提前失效。
- 上一正式与稳定构建保留，原 `.next` 已移到 `/private/tmp/yizhi-qoder-next-before-repair-1025`，可恢复；不清理其他工作树或用户浏览器原标签。

## 没有借本次上线宣称完成的功能

- 匿名首页真实模型短回复：`LANDING_MENTOR_PREVIEW_ENABLED=0`；预算原子迁移 `20261025033557_landing_preview_atomic_budget.sql` 没有应用正式库，原 62 份迁移未改。
- 保留生产既有 `COMPANION_LOOP` 关闭状态；已保存安排只读，不宣传新陪伴流程、主动跟进已完成。
- 真正服务端取消、迟到输出/切题竞态、真实 OAuth 交接、短信恢复、真实模型生成质量：不由这次零模型 UI 验收代替。相关 Grok 包继续按原门禁验收，不能因为这一批发布就标全完成。

## 设计检查

Impeccable 自动钩子保持关闭。手动对本次 UI 按两个不重叠文件组各扫一次，核心首页/Today 110 条、其余 Qoder UI 468 条提示；非建议级的 11+3 条经源行对比属于历史动画/渐变/样式。DESIGN 侧缓存与当前晨光样式存在历史偏差，只记录，不为清零重做风格，不把扫描数量当质量评分。

## 附件索引

- [正式首页面试演示](evidence/2026-10-25-today-repair/formal-home-interview.png)
- [云端无岗位 Today](evidence/2026-10-25-today-repair/cloud-no-job-today.png)
- [云端手改及刷新](evidence/2026-10-25-today-repair/cloud-browser-edit-refresh.png)
- [390 手机](evidence/2026-10-25-today-repair/home-mobile.png)
- 机器证据：同目录 `ci.json`、`formal-readback.json`、`data-guard.json`、`eval-archive.json`。不提交原环境、Cookie、QA 私有状态或私人内容。

ME 交接仅更新本地，不替用户推送共享业务仓库。
