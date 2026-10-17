# 奇思喵想参考后的简历区前端重构 · 2026-10-17

## 范围与参考

这次只重构简历工作区和它旁边的导师界面，保留用户认可的左侧导航。Agent 调用、保存队列、上传确认、原文件渲染、改稿事实与 PDF 排版算法未重写；不涉及数据库、认证、支付或旧面试作答。

实际用 Chrome 浏览了[奇思喵想](https://www.qisimiaoxiang.com.cn/)公开列表、滚动页面、查看公开缩略图并点击案例。案例详情要求手机号登录，未注册或绕过。参考的是可见交互层级，不将缩略图当成完整产品体验，也不复制第三方图像到产品里。

- [@jordanphughes 的上下文菜单](https://static.qisimiaoxiang.com.cn/works-test/work_1279_01.png)：低频查看、编辑和删除靠近对象，而不是常驻工具墙。
- [@startupvisuals 的 Agent 窗口](https://static.qisimiaoxiang.com.cn/works-test/work_1246.png)及 [@huge_icons 的编辑工具](https://static.qisimiaoxiang.com.cn/works-test/work_1250_01.png)：工具依附正在处理的内容，不再占一个大区域。
- [@studiobakers 的输入区](https://static.qisimiaoxiang.com.cn/works-test/work_1260_01.png)：缩小输入区内部操作的层级。没有照搬蓝色背景或装饰。

## 落地

简历成为中心白色文档，外围采用浅灰绿衬底；岗位上下文与阶段导航缩小。主操作保留“修改”和“导出 PDF”，撤销、重做、修改标记为轻量控件，原件、替换与模板收进原生顶层菜单。费用和云端保存状态仍可见。

修改浮层增加短标签“采纳 / 保留原文”，按实际高度调整位置，手机可触达。触屏下点击某段才出现该段编辑入口，不在每一段永久堆按钮；键盘仍可聚焦编辑。导师区只在简历场景使用紧凑阅读和输入样式，其他阶段不跟着改。

## 本轮实际验证

环境为独立的真实 Google Chrome 155（Playwright 驱动），不借用用户 Cookie、不操作用户现有标签。1440×1000、1280×900 和 390×844 均实际操作与截图。材料是明确标记的虚构样例，不是用户经历；截图中的费用待确认属于未登录预览，不作为真实计费结论。

- 更多菜单实际打开，Escape 关闭并还焦；滚动或改变窗口尺寸可关闭，手机菜单未越出视口。
- 修改标记开关、采纳、撤销、重做均改变当前纸面；采纳后对应标记消失。模板真实改变纸面字体，刷新后模板偏好恢复。
- 手机默认无常驻编辑按钮，点段落后只显示该段入口；打开编辑、修改并保存，再撤销读回原值。
- 未处理建议时导出会询问；取消保留待确认状态，同意后真实打开导出页，包含建议后的正文，不含编辑标记。
- 实际生成 [PDF](evidence/2026-10-17-qisi-resume/resume.pdf)：Chrome Skia PDF，1 页 A4，逐页栅格化查看，教育、技能、日期和联系方式齐全，无裁切。不是仅打开打印预览或把截图当 PDF。
- 复查发现并修复长说明浮层的滚动边界：1100×600 视口，浮层可视高 576、正文滚动高 1878；浮层内滚动后仍显示，外部滚动后关闭。
- 手机导师抽屉等过渡完成后重拍：390px 视口，left 46.8125、right 390、width 343.1875，transform 为零位移；不是过渡途中只露出一条边的截图。

开发预览的编辑状态不写云端，刷新会重置虚构样例。因此本轮不把模板偏好刷新称为“云端保存刷新复验”。真实模型质量、云端持久化沿用 [10-16 验收](2026-10-16-resume-block-editing-acceptance.md)的既有证据，没有追加收费模型调用，也没有重新签收它们。未读取或修改真人旧作答。

## 工程和设计检查

类型检查通过；本次 TS/TSX 的 ESLint 0 error，两条既有 unused warning 保留。全量回归 229 套、2297 项通过，5 套及其中 9 项 opt-in 跳过。`git diff --check` 和设计侧车 JSON 解析通过。

按仓库规则手动执行一次 Impeccable detect，必要修复后最多一次复核，自动钩子未启用。复核总计 375 个发现，其中 372 advisory、3 warning；3 个 warning 均位于未改的历史面试样式。逐 diff 归因：新保存状态颜色改为复用 muted；17px 的简历岗位上下文补入 DESIGN 和侧车；打印 CSS 所在改动行的两种颜色为既有值，未趁机扩大修复。没有以扫描总数冒充新增缺陷数。

独立 finish reviewer 检查本次差异和截图，要求修复浮层内部滚动及补齐稳定手机导师截图，其他已检查的桌面、中间尺寸、正文、菜单和编辑弹窗无实质回退。两项已按上面的真实 Chrome 结果修复/补证。不将工程审查称为用户审美批准。

## 证据

- [桌面](evidence/2026-10-17-qisi-resume/desktop.png)
- [中间尺寸](evidence/2026-10-17-qisi-resume/intermediate.png)
- [手机正文](evidence/2026-10-17-qisi-resume/mobile.png)
- [按需菜单](evidence/2026-10-17-qisi-resume/menu.png)
- [手机编辑](evidence/2026-10-17-qisi-resume/mobile-edit.png)
- [手机导师](evidence/2026-10-17-qisi-resume/mobile-mentor.png)

以上均为实际页面截图，无第三方模板冒充实现；所有新增栅格文件仅为 QA 证据，不作为 shipping UI asset。

## 发布

运行提交 `ca2b2f2ecfdeea6f0c58da073baa873b7b98374a` 已推 `origin/codex/qisi-resume-ui-1017`，远端 SHA 回读一致；只提交本轮 24 个文件。Git 精确归档独立发布目录，未带入共享主工作树的认证/支付/样式脏改动或未提交的首轮截图。

先以 `--prod --skip-domain` 云端构建，知识库仍为 34 篇 / 103 来源，Next.js 编译和 TypeScript 通过。受保护候选使用同项目既有 CLI 授权访问：首页 200 且实际含益职与登录正文，健康 200 / database ok，匿名 POST resume-agent 为应用 401 / 未认证。切换前再次确认 www 仍指向旧 `dpl_Fmb9XPpp9qAY4FWzbXt2CVrQKRZQ`，没有覆盖另一窗口的新发布。

随后成功 promote **同一构建**，无重新打包。正式 www 和裸域 API 核对均为 `dpl_3GvpzJ2eTpGtixaMtjNodRgty6t9` / production / READY，projectId 与 metadata.releaseCommit 一致；两个正式域名的 health 跟随既有规范域名跳转后均 200 / database ok，正式 www 匿名 resume-agent 仍为应用 401。没有变更环境变量、支付、数据库或用户记录。上述是发布与权限边界检查，不冒充正式登录后台整条保存流程复验。

## Deploy Result

- **URL**: https://www.ai-job-coach.xin/cockpit
- **Target**: production
- **Status**: READY
- **Commit**: ca2b2f2
- **Framework**: Next.js 16.3.0 / webpack
- **Build Duration**: 129.914 秒（deployment buildingAt → ready，不含排队）
- **Deployment**: dpl_3GvpzJ2eTpGtixaMtjNodRgty6t9
- **Candidate**: https://ai-job-coach-acsnzson6-velmavalienteqejimu22-jpgs-projects.vercel.app
- **Previous production**: dpl_Fmb9XPpp9qAY4FWzbXt2CVrQKRZQ（保留为回退目标，未执行回退）

### Post-Deploy Observability

- **Error scan**: 本部署近 5 分钟、error 级别、最多 50 条，无返回条目；不是长期零故障结论。
- **Drains**: 当前项目列表为空，0 个。
- **Monitoring**: 只有本次健康、权限和短窗日志核验；长期模型、计费上游和真实使用监控仍有缺口，未在 UI 重构中宣称解决。
