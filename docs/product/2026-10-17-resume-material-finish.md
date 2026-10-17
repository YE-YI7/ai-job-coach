# 简历区材质与操作细修 · 2026-10-17

## 本次落点

承接用户确认的[登录后案例与质感研究](2026-10-17-qisi-authenticated-case-study.md#6-质感专项补充用户希望多看的材料光影与细部)，只修简历区，不重做已认可左栏或首页。不使用参考站的第三方素材，不改 Agent 生成、计费、原件或 PDF 正文规则。

- 纸面仍为白色直角、原 A4 几何。屏幕外框区分接触影与环境影，极浅内沿表现纸边；底部留出阴影空间，不盖噪点，不进入 PDF。
- 工作底面只有缓慢明暗变化。改稿近白、导出墨色；细亮沿、下暗沿与不同投影建立工具重量，不给所有控件同一阴影。按下下移 1px 并收影，减少动态时取消。
- 更多菜单与采纳浮层共用近白透色面、局部 12px 背景虚化；字和图标清晰，低频工具仍收起。不增加分隔线、卡片、常驻删除或拖拽说明。
- 原位编辑保持纸面上下文，保存动作的材质与导出相同；键盘焦点、44px 触屏与删除/撤销语义不变。

## 回放发现并修复的功能问题

切版式后保存，旧 `srcDoc` 的 Document 有时仍为 complete，提前消耗回焦回执，随后导航清掉焦点。实际 Chrome 回放复现到 body。修复为按生成 HTML 的非安全用途指纹标记文档，只有当前文档可消费回执，load 绑定控件后补回焦。未开放 iframe 脚本/表单权限，不影响打印渲染器。

正式导出验收又暴露 SSR 就绪窗口：纸面已显示、原生 popover 可以打开，但 React 事件尚未绑定，过早点导出没有反应。已补 `useSyncExternalStore` 的 server-false/client-true 就绪状态；主要动作由原生 disabled fieldset 一起保护，其余工具同步禁用，不显示虚假的可操作状态。Chrome 实际拦住 hydration 脚本复现：SSR 工具不可点，放行脚本后一次点击即可打开同意弹窗和真正打印窗口。不是用重试双击掩盖问题。

后续完整路径再抓到菜单的原生 invoker 缺失：手动 `showPopover()` 打开没有关联触发按钮，第二次点触发器时先被 light-dismiss 关闭、click 又打开。现在通过标准 `source` 选项关联当前按钮，实测第二次点击确实关闭，选版式后导出也不再被菜单状态吞掉。DOM 类型旧于该选项，仅对这一调用窄化类型，没有升级依赖或换自制弹窗。[API 行为参考](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/showPopover#parameters)。

## 本地验收

`scripts/accept-resume-inline-ui.mjs`：12 项真实 Chrome 回放通过，明确为本地虚构 fixture、不是云保存或模型质量验收。包括真实延迟 hydration 的就绪保护与单次导出；触发按钮第二次点击关闭/选版式后单次导出；菜单键盘进出、采纳浮层关闭、未决导出取消；标题/段落编辑、删空确认/取消、删除撤销、历史重做；草稿跨阶段/原件/版式保留及当前文档回焦；390px 触屏、1100px 中间尺寸与减少动态。截图等待菜单入场结束，不把透明补间误记成静态质感。

229 套件 / 2297 项自动回归通过，5 套件 / 9 项 opt-in 跳过；类型与本次 TSX/脚本 lint 通过。后续正式 Chrome 回放单独记载，不提前签收。

手动 Impeccable detector 一次集中运行，hooks 保持关闭；功能修复后一次有限复核共 271 项，3 条 warning（两处粗色条、一处字体）均在未修改的历史规则。其余 268 项主要是历史令牌漂移和本次局部材质色/阴影 advisory，已记录实际局部规则，不为清空检测改全站。React 检查修掉了 render 时写 ref，改为 layout effect。

后来新增功能修复的 ResumeToolbar.tsx 仅作首次单文件检查，结果 `[]`；没有对前批 UI 再循环扫描或扩大历史修复。

### 视觉证据

均为明示虚构资料，不是用户简历。与当前代码批量核看桌面、原位编辑、菜单、采纳浮层、导出确认、390px 和中间尺寸；没有以测试数量代替审美批准。

- [桌面纸面与工具](evidence/2026-10-17-resume-material/local-desktop.png)
- [桌面菜单](evidence/2026-10-17-resume-material/local-menu.png)
- [手机菜单](evidence/2026-10-17-resume-material/local-mobile-menu.png)
- [纸面内编辑](evidence/2026-10-17-resume-material/local-inline.png)

## 发布与正式验收

首发 a44b317 / dpl_AaLyCuUoWY4EJBqRixytreUh7Zjz 双域 READY，云构建 98.499 秒、健康 database ok、匿名 401。正式独立 QA 的标题保存刷新、只针对自己机会的 PATCH503 失败保留/云端无新字/重试刷新已两次通过；但导出首次点击未触发，未提前签收 PDF。就绪保护修复后将发布替代版本，重验完整路径，完成后追加证据。

### 最终 Deploy Result

- URL：https://www.ai-job-coach.xin/cockpit；裸域同版。
- Target：production；Status：READY。
- Commit：`354eefffc08178c7af7cdc2a718a2b3515980199`。
- Deployment：`dpl_4UphbEu4VvKLNViLvy1iFsj3Rxym`。
- Framework：Next.js 16.3.0 / webpack。
- Build Duration：97.629 秒（buildingAt → ready）。
- Candidate：https://ai-job-coach-5dz74pg3h-velmavalienteqejimu22-jpgs-projects.vercel.app。

先以本提交干净 Git archive 构建 production、`--skip-domain`，核实健康 database ok、匿名 resume-agent 401，确认正式双域仍是上一提交后 promote 同一构建，没有重建。www 与裸域 API 已回读到同一 deployment/commit/READY。中间 `4a5f211` 的就绪修复版也已被本版本替代；之前的“待验”是过程，不是当前发布状态。

### 最终正式 Chrome 回放

`scripts/accept-resume-material-production.mjs` 使用独立 Google Chrome（headless channel chrome），正常登录一次性免费 QA 身份，只用明示虚构的陈知远简历，不读取现有浏览器 Cookie 或真人旧材料。

1. 原位改标题，等实际云存回执，刷新和同账号 GET 都恢复“项目实践与产出”。
2. 只对 QA 机会的 PATCH 返回受控 503；段落仍在界面，同账号 GET 尚无新文字。移除拦截，点重试、等成功回执，再刷新后段落恢复。
3. 经典、蓝灰、暖色逐个选版式，实际收起菜单后**单次**点击导出，三个新窗口真实出现；点击“保存为 PDF”各触发一次 beforeprint，再由同一 Chrome 打印引擎落盘。没有另造渲染器或改成截图 PDF。
4. 三份导出均无编辑器、编辑按钮、拖柄或荧光标记；已保存标题和重试段落都在。每份逐页重渲染核看，均一页 A4、无文字截断、重叠或空白页，纸面阴影没有进 PDF。
5. 390px 正式工作区无页面横向溢出；全程 pageerror 0、resume-agent 请求 0。本轮没有评价或改写模型质量。

| 版式 | 页数 / 页面 | 文件大小 | 文字核对 |
|---|---|---|---|
| 经典黑白 | 1 / 594.96×841.92pt | 50377 bytes | 244 字符，NFKC 后保存标题/段落匹配 |
| 简洁蓝灰 | 1 / 594.96×841.92pt | 189282 bytes | 同上 |
| 温润纸感 | 1 / 594.96×841.92pt | 189279 bytes | 同上 |

Chrome 导出的文字层含部分康熙部首兼容字形，按 Unicode NFKC 归一化后核对；未冒称任意 ATS 或所有长简历都一页。输出几何和正文渲染器未在本次修改。

证据：[正式桌面](evidence/2026-10-17-resume-material/production-desktop.png)、[受控保存失败](evidence/2026-10-17-resume-material/production-save-failure.png)、[正式手机](evidence/2026-10-17-resume-material/production-mobile.png)；[经典 PDF](evidence/2026-10-17-resume-material/production-classic.pdf)、[蓝灰 PDF](evidence/2026-10-17-resume-material/production-modern.pdf)、[暖色 PDF](evidence/2026-10-17-resume-material/production-warm.pdf)。对应 `*-render.png` 为逐页核看产物。

### 数据保护与运行边界

- 旧 interview_answers 全程只读聚合、不读正文；起始、清理前后始终 41 条、同一整行聚合 MD5 `e07577b07eec07d4f8092ccf2594d2a1`。没有修改旧作答、真人简历、余额或额度。
- QA 工作区经正常 DELETE 清理；退出登录后，只按已核对的精确 UUID、测试邮箱及邀请码删除虚构 public/auth 用户、会话、34 条 QA 产品事件和一次性 invite，回读工作区/用户/Auth/事件/invite 全 0。可按脚本重建虚构材料，不是删除真人历史；本地验收文件保留。
- 首轮默认 Chrome 连接的登录等待超时、过短的测试等待和未关联 invoker 的菜单问题分别记录。最终独立 QA Chrome 仅在该进程禁用 HTTP/2/QUIC 完成真实 UI 回放，未改用户 Chrome 配置、安全限制或宣称所有连接问题已根治。
- 最终提交再跑 2297 项回归通过、5 套件/9 项 opt-in 跳过，类型/lint、12 项本地 Chrome 和云构建通过。原文件上传/替换与新模型质量没有在本次扩大签收。
- Post-deploy observability：该部署最近 5 分钟 error 查询无条目；project drains 0。仅短窗证据，长期监控仍有缺口，没有擅自购买服务。
- 仅产品任务文件提交/推送；未跟踪的 `.impeccable/review/qisi-20261017/` 未混入，ME 共享状态存在其他会话暂存改动，留在工作树、不一起提交。
