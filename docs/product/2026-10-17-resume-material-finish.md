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
