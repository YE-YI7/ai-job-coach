# 输入焦点：去掉彩色粗框与整表单描边

## 用户反馈与范围

原话：有一个 UI 上的瑕疵 就是你所有的输入框点了之后 都会有一个这个颜色的框 看着很难看

截图分别是简历导师整表单的绿色外框，以及 +86 复合输入框内外两层棕色外框。本轮只修文本输入焦点，保留现有布局、登录页背景与动效、左栏、按钮样式、输入内容和所有业务保存逻辑。不涉及模型、短信发送或绑定行为、数据库迁移、简历与面试作答。

## 实现

- 共用 `--field-focus: #777d78`；文本输入使用 1px 内侧底线及已有边框的中性加深，不再外扩彩色光晕。
- 全局后备覆盖旧 Tailwind 文本输入 ring；排除 checkbox/radio/range/file/color/hidden/按钮类 input，不把错误边框的 aria-invalid 改为普通边框。
- 导师区删除整个 form 的 focus-within 外框；提示语、标题和提交按钮不再一起被描框。输入本身保留可见细线。
- +86 与号码只由外层显示一次焦点；内层 input 不再重复 outline/shadow。短信验证码同一规则。
- 简历原位编辑 iframe、采纳弹层、恢复输入、模拟面试及公开首页 textarea 使用相同局部提示。邮箱与原六位验证码去橙色光晕，原氛围不动。
- 按钮、链接与复选框的键盘焦点保留；无新增监听器、请求、存储或依赖。

## 本地与静态验证

- 5 套 / 53 项（含 5 项新增 CSS 合同及手机号回归）通过；工作区 16 套 / 129 项通过，两次中的 5 项合同重复计入，合计 177 个不同测试，不称全量测试。
- `tsc --noEmit` 通过。修改的 TSX 与新测试 eslint 0 error / 2 个原登录页历史 img 性能 warning。
- 手动 Impeccable 一次 detect + 一次有限复核；新版令牌已登记 DESIGN.md，field 色 advisory=0。复核全文件共 378 项，其中 7 个 primary 都能在修改前 HEAD 找到：原全局 bounce/左色条、原工作区面试左色条及 Georgia。未改它们，不把全文件扫描说成零问题；自动钩子关闭。
- Chrome 原位编辑：真实组件使用已有虚构 preview 材料，点击编辑而不保存，textarea 与 editor 的 outline 都 none，textarea computed shadow 为中性色 1px inset。Tab 可到删除按钮，按钮焦点仍在。
- Chrome 导师：临时纯本地夹具挂载真实 `ResumeAgentConversation`，外层也使用真实 `AgentConversation` panel/data-resume/guidedWorkflow 结构，只给虚构 ready 任务，不调用模型、不存业务数据。聚焦后 textarea 和 form 的 outline 均 none，输入保留 1px 中性底线。夹具未提交、未上传，并已删除。
- 390px 验收最初高层 viewport override 没生效，不能据此签收；后改为本标签 CDP 精确 override，实际 innerWidth/scrollWidth 均 390、字号 16px、form outline none。截图后已清掉 override。没有改 Chrome 全局设置。
- 私有截图 `/tmp/yizhi-focus-mentor-desktop.png`、`/tmp/yizhi-focus-mentor-mobile.png`。均明确是本地真实组件 + 虚构状态，不冒充真实模型/云端保存验收。

## 发布

运行提交 `abede4d`，12 个任务文件，已推独立分支 `codex/resume-detail-polish-1017`。同一项目 `prj_fav7gQZKEEE2JO3b8v9S9leeRhkS` / 团队 `team_7qIutahimwnjCje1fOtQEPyT`，Production `--skip-domain` 构建完成后实际 Chrome 通过，已 promote 同一构建：`dpl_9WchAcdrfhRNnF2Lq5LfyHLBD3Gp`。

- Chrome 该云端构建实际登录页：手机号 inner outline/shadow 均 none；wrapper outline none、border 为 rgb(119,125,120)、仅 1px inset 底线。Tab 到未勾选的 consent 复选框仍 matches focus-visible / 2px solid，未填写号码、未勾选或获取短信。390px 真视口字号 16px、innerWidth/scrollWidth 均 390，无双框；override 已清。邮箱方式切换、输入自动聚焦，内层 shadow none，外层只有同一中性底线。不是仅看静态示例或只查源代码。
- 正式发布前再次核对原版本仍为 `dpl_EVJAo1mQE4McWCWDrbHtXtjopfnb`，没有覆盖其他新版本。promote 成功后裸域和 www 各自 inspect 均指向新部署 READY，双域 health 都为 ok/database ok；正式域 Chrome 邮箱输入 computed outline none、inner shadow none、parent 为 1px inset 中性线。原登录背景和按钮仍保留。
- 云端截图 `/tmp/yizhi-focus-phone-after.png`、`/tmp/yizhi-focus-phone-mobile.png`；正式域截图 `/tmp/yizhi-focus-live-email-after.png`。未给账号重新发送 OTP，既有绑定/登录链路继承上一轮真实验收，本轮不冒称再次做了一轮短信登录。
- 本轮不读取密钥、完整号码或 OTP，不发送短信、不修改/退出用户账号，不触发真实改稿或改旧作答。当前账户资料状态仅作浏览器展示，不用它推断测试前后 DB 行数或旧数据哈希。

### Deploy Result

- URL: https://www.ai-job-coach.xin （同一构建 https://ai-job-coach-lpna7b968-velmavalienteqejimu22-jpgs-projects.vercel.app）
- Target: production
- Status: READY
- Commit: abede4d
- Framework: Next.js 16.3.0
- Build Duration: 云端构建日志约 1 分钟，不含排队/上传

Post-Deploy Observability：新部署近 1 小时可查询的 error 请求 0（部署刚完成，只是短窗，不代表已跑满 1 小时）；Drains 本轮未评估/配置，持续告警仍有未核验缺口，不据本次 UI 修复扩大接入。
