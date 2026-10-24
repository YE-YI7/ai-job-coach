# 2026-10-24 DeepSeek UI 验收：已集成，浏览器交付门禁待完成

## 最新：本人授权核对全部候选后的集成

本人回复“不知道最终交接，你核对一下”，本轮已自行审两个目录，不再把缺提交号当作继续工作的阻塞。从当前正式源 `3cefa06` 新建 `codex/ds-ui-integration-1024`，不从任一落后脏树整体部署。下文“尚未实际择入／等待确认”保留为首轮历史，不代表本轮最新状态。

### 实际择入与排除

| 块 | 本轮处理 | 边界 |
| --- | --- | --- |
| 四材料起点首页 | 采用局部候选 HomeLanding 与 entry-doors；修真实登录返回、四门路由、FAQ 与结构化数据一致、免费限单段文案 | 原完整互动简历／面试演示保留在精确公开 `/demo`；`/demo/private` 仍受保护 |
| 工作区入口 | 抽出 EntryWorkspace；简历复用 save_only、JD 复用原整理、无材料复用当前 CompanionStart | 选起点本身不调用模型；不使用旧版聊天；真实模型门禁与收费保持原实现 |
| 保存／恢复接线 | 成功保存或明确退出后消费 entry 参数，防止刷新重开上传；找岗位草稿与“已开始”状态按账号隔离恢复 | 刷新不自动再次发起模型；服务器会话与原消息恢复逻辑不重写 |
| 谈薪与证据 | 择入 6 文件局部 UI，抽出 SalaryOverview / EvidenceDistribution，四类证据按真实数量分布，修演示 5 条要求的计数 | 只使用原 Offer／谈薪回调，不改判断、市场价格、额度与支付 |
| 复盘与导师栏 | 轮次去重复标签、题数、窄分隔条抓手与双击恢复 | 原模型菜单及位置、Markdown、渐进流、消息错误恢复均保留 |
| 轻引导 | 采用并修 CoachTour：账号级首次、可跳过／重播、Escape、只在卡片内处理方向键 | 延迟提示遇到打字取消，不抢走新焦点；移动目标与减少动效已接 |
| 旧全局重构／全套换肤 | **没有整包复制**。旧 globals、ModelPicker CSS 及大块 cockpit CSS 与当前组件契约不一致 | 不能让 UI 改版回退已经正式发布的陪伴、Trace、OCR／质检、聊天和打印修复 |
| 旧鉴权／支付／短信／目录清理 | **排除**，不是本次 UI 包 | 不应用旧树 API 删除、支付组件、邀请或凭据变更；不发短信、不调用支付 |
| 素材 | 新首页专用 4 个已提供字体及 OFL；角色写入 DESIGN 和 surface brief | 不传播到用户简历、聊天或 PDF；去掉示例无限浮动，保留一次短入场 |

**关键代码字节相同：**相对 `3cefa06`，ModelPicker TSX/CSS、ResumeAgentConversation、ResumeToolbar、ResumeExport、resume-print、resume-execution、companion-protocol、quota 均未改。AgentConversation 唯一 diff 是原 form 加一个引导定位属性。

### 实际验证与尚未通过的门禁

- 冻结后最终全量 295 套总计、290 套执行通过（5 套原跳过），2,859 项通过、10 原跳过、0 失败。入口消费与找岗位恢复回归包含在此数中，不与此前轮次相加。
- 类型与本轮新组件 lint 通过，空白检查通过。没有删除断言、改变收费或下调质检。
- 冻结后 Production 环境参数下完整 `npm run build` 退出 0，Next 16.3 Webpack 编译与静态生成通过；预编译知识产物无额外差异。中间件／preferredRegion 的既有弃用提示不是新构建失败。没有手动部署 Production 候选或切域名。
- 本地真实浏览器已验证首页四门链接、主 CTA 进入正确登录返回地址、桌面和 390px 无横溢（390 工具截图不匹配，**不算移动视觉验收**）；实际薪资卡、原 Offer 表单、证据 3/5=60% 与四类统计、引导跳过／重播／Escape 通过。
- 随后 IAB 的 Emulation.setFocusEmulationEnabled 持续超时、Chrome 原生 AX 也超时；查文档尝试已支持恢复方式仍未恢复。已恢复浏览器临时 viewport，未改系统设置或操作其他人的浏览器。新增延迟焦点及入口恢复代码尚待新浏览器实测。
- **本轮新登录后的云保存／刷新、启用模型菜单恢复、实际新 PDF 仍未完成，不能用上轮 PDF 抵替，也不能写“验收全过”。**本轮没有调用模型，因而不造 Trace ID 或模型修改 ID。
- 本轮本地 3358 自有验收服务已停止；他人 3100 服务与源工作树未动。IAB 自有临时页无法重新绑定，随任务结束由临时页机制关闭，原用户页未关。
- Impeccable 集成后手动一次、必要修复后仅复核一次，hooks 未开启。最终 308 项：305 advisory、3 primary；3 primary 均为既有 CockpitApp CSS 4px 边线／Georgia，非本次引入，不扩大修复。新字体意图已明确而非忽略规则。

### 数据保护与费用

现有生产权限仅用于只读排序摘要核对。前后 41 旧面试作答、16 resumes、16 user_resumes、142 额度行、积分钱包／流水／预留 1/1/6 的哈希全部相同。
未创建 QA 账号或邀请码，未登录真人或产生数据写入，未跑模型／短信／支付／兑换，未改密钥或迁移。随机本地 QA 草稿未投入使用，私有临时文件收尾精确移除。保护摘要的哈希而非用户原文保留在验收目录。

**当前发布决定：暂不切流。**正式仍为 `dpl_CgN3UhExdc6ELWPAz7CyDnUnfgho` / READY，当前与上一稳定版均保留。应从本分支继续补浏览器云保存／刷新和新 PDF，不重复寻找 DS 最终包、不重做已完成的 UI 集成、不恢复旧 QA 登录、不自动追加模型费用。

### 提交后复核

运行代码与本报告首稿仅 40 个本任务文件，提交 `2f76d4b27916f235a1b2defe47406d5eac07f90d` 已推送，远端同 SHA；原未跟踪打印检查目录没有夹带。[GitHub 40087209379](https://github.com/YE-YI7/ai-job-coach/actions/runs/40087209379) 已 completed/success，类型／全量和全新隔离结构重建两项均 success。

推送正常触发了自动 **Preview** `dpl_6ZAtZ5AksykY5C3e6Md4we7dNTLr`，并非 Production 候选或 promote。它的构建／截图不替代尚未完成的真实登录云保存／刷新／新 PDF；此处不将 Preview 作为正式可交付链接。正式域再次解析核为 CgN3 / READY，health 返回 ok / database ok。本补充只更正文档状态，不引入新的运行代码或放宽发布门禁。

---

## 首轮历史记录（已被上面集成进度覆盖）

## 结论与范围

本人要求验收 DeepSeek 的首页和全产品 UI，通过后上线。本轮发现两份不同的未提交 UI，尚无可核实的最终交接文件或提交号，因此未将任何一份当作最终发布包，也未更改正式域名。

实际正式部署仍为 `dpl_CgN3UhExdc6ELWPAz7CyDnUnfgho`，目标 `production`、状态 `READY`，对应已验收的陪伴 v3。正式运行源为 `32ba8d4`，证据提交为 `3cefa06`。前一稳定版不动。

## 定位到的候选

| 目录 | 基线 | 实际状态 |
| --- | --- | --- |
| `.../github-plugin-github-openai-curated-remote/me/ai-job-coach` | `9a3acec` / `codex/agent-distribution` | 首页、全局令牌、多处产品样式、引导/拖入组件等未提交；同时混有登录、支付等历史改动，不能将整个脏树认作本次 DS UI |
| `/private/tmp/yizhi-prod-ui-1024` | `9a7df27` / `codex/prod-ui-polish-1024` | 开着 3100 预览；6 个未提交文件，涉及谈薪入口、证据分布、复盘轮次、题目计数、导师栏拖拽与演示计数 |
| `/private/tmp/yizhi-ocr-hotfix-20261022.f9og6X/checkout` | `3cefa06` / `codex/companion-v3-acceptance-1023` | 当前正式基线；本轮仅新增本报告，不改运行代码 |

这里的目录与修改时间只是定位证据，不能据此确认作者或裁决哪个是用户看到的最终设计。已向本人询问最终交接路径或提交号。

## 发布阻塞

### P1：不能整树覆盖当前正式版

`yizhi-prod-ui-1024` 当前树缺少以下已经正式发布的文件：

- `app/api/coach/companion/route.ts`
- `app/api/admin/companion-traces/route.ts`
- `lib/coach-harness/companion-protocol.ts`
- `components/cockpit/CompanionStart.tsx`
- `components/cockpit/CurrentArrangement.tsx`

其 `AgentConversation.tsx` 相对正式版还没有 companionBinding / companionVisibleText / companionRetryText 集成。以上属于候选基线落后，不等于 DS 主动删除了这些代码；但直接部署这个目录会造成真实回退，不能以样式正常为由放行。

只读验证：这 6 个未提交文件的局部 diff 对正式树执行 `git apply --check` 成功。后续可从正式基线择入 UI，而不是整体合并旧树；本轮没有实际 apply。

### P1：首页主要 CTA 仍指向旧注册页

3100 候选首页 `app/HomeLanding.tsx` 顶部“开始使用”指向 `/register`。在未登录浏览器实际点击，落到 `/login?redirect=%2Fregister`，而不是登录后回工作台。不得将这种路径当成新手机号登录入口已验收。

### 验收环境阻塞，非已确认的线上故障

该候选 `node_modules` 链接到旧 `me/ai-job-coach/node_modules`。候选类型检查退出 2，缺少：

- `@alicloud/dypnsapi20170525`
- `@alicloud/openapi-core`
- `@darabonba/typescript`

浏览器进入候选登录页后也捕获到同一模块解析错误，页面空白。当前正式基线依赖目录具有这三个包。未修改共享 node_modules 链接、未停止他人 3100 服务，也未因这个本地故障要求用户重新开通短信。

## 本轮实际检查

- Vercel 从当前正式 checkout 检查项目身份，确认为 `velmavalienteqejimu22-jpgs-projects/ai-job-coach`，project ID `prj_fav7gQZKEEE2JO3b8v9S9leeRhkS`；正式部署仍 CgN3 / READY。
- 远端分支只读核对：正式验收分支仍 `3cefa06`，production-release 仍 `9a7df27`；未发现上述 `prod-ui-polish-1024` 分支的远端提交。
- 3100 首页实际渲染并检查桌面视觉；实际点击主 CTA 复现旧注册返回地址。
- 3100 中间件测试 1 套、15 项通过，包括精确公开 `/demo` 和保护 `/demo/private`。演示页空白源于本地依赖编译失败，**不能误报成 `/demo` 未被匿名放行**。
- 旧 `me/ai-job-coach` 树独立类型检查通过；这个结果不代表它包含当前正式功能，也不代表完整浏览器验收通过。
- 6 个局部 UI 修改的空白检查通过、在正式树的只读补丁兼容检查通过。
- 未跑全量新候选测试，未完成本轮手机、正常云保存/刷新、实际新 PDF 或登录后的全路径验收。此前陪伴 v3 的这些证据保留，不能挪作本次 DS UI 已通过的证明。

## 手动设计检测

按约定只运行一次 Impeccable detect，自动钩子未开启。

结果：312 条，其中 308 advisory、4 primary。4 条中，旧 CSS 859/860 的 4px 侧边线和 1040 的 Georgia 是既有代码，不扩大本轮修复；新增 1520 附近拖拽握把的 `height` transition 为局部性能建议，优先级低于入口与发布基线。检测不证明审美通过或功能交付。原始结果：`/private/tmp/yizhi-ds-ui-review-1024.bY6RGu/detect.json`。

## 接续顺序

1. 确认 DS 最终交接路径/提交号及其首页版本，冻结本次 UI 文件清单。
2. 从 `3cefa06` 正式基线择入确认的 UI；保留陪伴、Trace、简历质检/返修、模型菜单、Markdown、渐进回复、收费和持久化语义。
3. 修正主要 CTA，使用完整依赖建立隔离候选；不借修 UI 更改认证、支付接口或旧数据。
4. 类型、相关回归与全量测试；桌面/窄屏真实交互；用虚构数据验保存刷新与本次实际 PDF。不将历史 PDF 或模拟保存冒充本次实测。
5. 同一暂存生产构建通过后再 promote，保留本次当前正式版作为回滚点；不清理仍在用的构建。

## 数据与费用边界

本轮没有模型调用、短信、支付、积分兑换、数据库业务写入、凭据变更或正式切换。没有读取/改写真人简历和旧作答，没有消费历史已用完的两次模型预算。未创建应用请求，所以本轮没有可关联的模型 Trace ID，不补造。

正式版对照截图：`/Users/yi/.codex/visualizations/2026/08/12/019ff5a3-9056-7d43-8699-0111f7f80204/yizhi-ds-ui-review-current-live.png`。临时验收浏览器页已关闭，原用户页和他人开发服务保留。
