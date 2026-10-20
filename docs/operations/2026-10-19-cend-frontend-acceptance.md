# 2026-10-19 · Qoder C 端前端验收

## 最新补充：保留品牌 logo 的紧凑模型菜单

用户要求恢复之前带 logo 的弹出列表、每行更矮；入口仍在输入面左下角。复用原本地品牌图片与模型目录，保留参考价排序、可用状态、选中标记及价格/速度说明。旧两行条目约60px，本版实测44px；触发器显示当前模型的 logo 与名称。没有恢复旧 TokenPay 绑定 CTA，不修改模型调用、价格、账户或计费。

Chrome 本机虚构接口夹具验收：桌面1465×794、手机390×844行高均44px，logo完整载入；手机菜单left12/right378、top12/bottom552，无裁切或横向溢出。原生top-layer弹框优先向上且限制视口，外点/再次点触发器/Escape均关闭，Escape回焦。方向键跳过不可用GLM条目，Home/End有效；本机选Kimi后整页刷新仍恢复名称与logo，既有输入草稿保留，未发送模型请求。两实例使用唯一ID，不改简历补问的固定编排。虚构模型可用性仅在临时夹具，不进入发布归档。

TypeScript、任务组件ESLint、4套29项定向测试通过。按Impeccable规则只对本次4个UI文件手动detect一次：89条advisory均为既有AgentConversation样式，0 primary，未扩修历史或启用hooks。桌面与手机证据位于`/tmp/yizhi-cend-acceptance.zlA2nd/model-logo-{desktop,mobile}.png`。

**已上线：** https://yizhioffer.com / Production / READY / `14a36dc`，干净归档构建约1分钟、Next.js16.3.0、135页通过。唯一候选`ai-job-coach-hdz69h8bu-velmavalienteqejimu22-jpgs-projects.vercel.app` / `dpl_GbeDVUtyo9yx65NSSEFQeCihMhLi`，既有CLI权限核候选health/database ok，sourceCommit、项目及Production精确一致；fresh确认主域仍6GH…后promote同一构建。正式fresh inspect精确Gbe…/READY，health200/database ok、匿名session401。

Chrome正式原账号刷新8岗位、6处原简历待确认仍在；普通辅导模型auto未改，正式菜单稳定展开、12个模型logo均载入，前5行均44px，边界x1047.8–1439.8/y153.6–693.5落在1465×794视口内。Escape关闭回原触发器；未选择原账号模型、未发送或改变原内容。正式安全截图只截右栏`/tmp/yizhi-cend-acceptance.zlA2nd/model-logo-production.png`。本轮刷新后未捕获模型相关hydration错误；本机双组件夹具的另一简历组件有既有localStorage hydration提示，不归因或扩修模型菜单。短窗10分钟/最多30条部署error为空，长期Drains缺口仍未改。QA服务及临时页已关闭、视口还原。未改API/数据库/作答/积分，未重跑模型、PDF、短信或支付；不以UI菜单验收冒充这些链路已复测。

## 后续明确选择：模型入口保留左下角

用户回复“模型选择的功能还要，而且保持原位置，放到输入区左下角”，推翻上一版把模型收进顶部设置的暂定方案。已仅将普通辅导模型选择移回白色输入面左下角，当前模型名直接可见；语音与发送在右侧，模式与费用说明继续顶部低频入口。保留原目录/可用状态/价格顺序、localStorage 选择与请求参数；不增加调用、自动发送或计费。简历 Agent 的固定模型编排没有因此改变，不在简历补问中展示一个不会影响改稿的假开关。

本轮 TypeScript、任务组件 ESLint、31 项定向通过；本次两个 UI 文件手动 detect 无 primary。Chrome 本机虚构夹具切换 auto/fast 后刷新仍保留，手机390宽实测模型触达44px、发送44px且两者不重叠、无横向溢出；当前模型名位于语音与发送左侧。显示名称改为 server/client 一致的 auto 首帧，再于挂载时只读恢复有效偏好，避免非默认模型名引起 hydration 文本不一致；会话加载完成前不能发送，不把恢复过程写回偏好。此为本地模型偏好验证，不发真实模型请求、不修改原账号偏好。d61911e 首候选仅为中间构建，不 promote；待包含恢复修正的最终干净构建与正式刷新记录。

**本轮已上线：** https://yizhioffer.com / Production / READY / `2504c87` / Next.js 16.3.0 / 构建约1分钟。最终部署 `dpl_6GHvbEMx3NDvimzN6wmedDhWqTwF`，唯一正式候选 `ai-job-coach-8tpfjf135-velmavalienteqejimu22-jpgs-projects.vercel.app`；干净归档、不含本机夹具。候选原 CLI 权限 health database ok；sourceCommit/项目/环境核对后，fresh 确认主域仍为 A2n…，promote 同一构建，未 promote 中间 d61911e。正式 fresh inspect 为 6GH… / READY，health200/database ok、匿名 session401。

Chrome 正式原账号刷新仍8岗位与原简历6处建议，切换“其他辅导”仅查看：模型 auto 入口 enabled、位于输入面左下 x1047.8–1287.8，发送在 x1396；未选择/发送或改原账号模型，原输入空。本机非默认 fast 完整刷新后正确恢复；实际手机工作台390宽模型入口44px、右边265 < 发送左边311，无溢出；最终页面未再出现该模型名的 hydration 问题标记。一次初检及一次必要复核，两个任务 UI 文件89条 advisory / 0 primary，不扩修历史。正式右栏截图 `/tmp/yizhi-cend-acceptance.zlA2nd/model-position-production.png`。本部署10分钟/最多30条 error日志为空；Drains沿用上轮已发现的0配置缺口，未声称补齐长期监控。未重新跑本轮全量测试、PDF、短信、支付或模型；未做数据库业务写入、未兑换或扣积分。本机服务与两临时验收页已关闭、视口还原；共享ME只更新本线不提交。

## 发布边界

用户要求验收并上线 Qoder 的 C 端改动。仅修改导师栏及简历补问的输入区、设置入口与历史菜单；不改左栏、简历渲染/PDF、Agent、认证、数据库、支付或积分规则。不夹带本地未跟踪的真实 Eval JSON、截图和 Supabase 临时资料。

Qoder 去除了常驻模式与模型入口，但状态及调用仍存在。为避免隐藏选择无法更改，验收补上标题旁低频“辅导设置”；输入区仍仅保留语音与发送。已向用户说明该实现假设，未收到位置偏好的进一步答复。删除旧 ModelPicker 文件，保留既有模型目录、价格顺序与原调用参数，不触发自动发送。

## 本次修正

- 撤除 Qoder 重新引入的灰色聚焦边框，保留白色单层书写面与既有柔影。
- 历史菜单外点关闭、Escape 分层关闭、返回触发器焦点。
- 设置使用原生 top-layer popover，坐标限制视口内；修复窄屏被导师面板 overflow 裁切，支持关闭与监听清理。
- 手机输入 16px、语音和发送至少 44×44px；标题设置同样 44px。
- 简历补问动作位于输入面内，说明和题目仍在外面；保存失败不清空输入。

## 已完成的验收

- TypeScript 通过；AgentConversation/ResumeAgentConversation ESLint 无错误。CockpitApp 两条历史未使用变量警告未扩大修复。
- 4 套定向测试 31/31 通过。全量 2498 passed / 4 failed / 10 skipped；4 项均为此前已存在的 Manus、Greenhouse、Lever、Ashby 岗位导入失败，不放宽网络安全规则刷绿。
- Chrome 使用本机虚构、无数据库/密钥/模型的接口夹具验证：普通辅导失败保留输入；补问失败后重试成功，本地刷新恢复；历史 A/B 切换、外点与双层 Escape；设置切换模式/模型不发送；Escape 回焦。
- 实际 Cockpit preview 在桌面 1440×900 与手机 390×844 检查：左栏/纸面保持；手机文档宽度等于视口无横向溢出；设置在视口内完整显示；普通输入 font-size 16px、border/outline/inner shadow 均无，按钮实测 44×44px。
- Impeccable 自动 hooks 保持关闭，仅一次手动初检及一次必要复核。最终 339 条中 3 条 primary 均为未改动 CockpitApp 历史侧线/字体；无本次新增 primary。其余历史 advisory 未扩修，新增 13px 圆角已改为现有 12px。
- 夹具输入保存属于本机状态恢复，不冒充云端改稿或真实模型验收；PDF 渲染与云端保存链路本次未改，未重复发起模型或支付测试。

## 发布前原数据只读基线

统一口径 `md5(coalesce(string_agg(row_to_json(t)::text,'' order by t.id),''))`：旧作答 41 条 `0881efbb0a4a159ba1e7b5460c6007d8`；全站工作区 33 条 `10387ab8df982aabc46f6e5acd85d09f`；本人工作区 10 条 `ae949dcd2e71a2bd443842ed6af7e853`。本人 wallet/transfer/reservation 各 0 行。无业务写入或 schema 操作。

发布前正式部署 `dpl_2Tnu4P7EXiE67hp24R5bGdVhbnGy` / source `6d743b5`。

## 已上线及正式验收

- **URL / Target / Status：** https://yizhioffer.com / Production / READY。
- **Commit / Framework / Build：** `6615ada` / Next.js 16.3.0 / 云构建约 2 分钟；TypeScript、135 页生成通过。
- **Deployment：** `dpl_A2n9QF6YFFcDZEQ8VY3Er2xZo9av`；唯一候选 `ai-job-coach-9vk3yadmz-velmavalienteqejimu22-jpgs-projects.vercel.app`。候选由干净 git archive 创建，未包含本机接口夹具或未跟踪的真实数据。代码已推既有分支。
- 临时候选受 Vercel 访问保护，普通 HTTP 探针到达 Vercel 登录页，不作为业务失败或成功；改用现有 CLI 认证验 `/api/health` database ok、管理员反馈 API 401。未关闭保护或增配权限。
- promote 前 fresh inspect 确认正式仍是前版 `dpl_2Tnu…`，随后 promote 同一 Production 构建；正式 fresh inspect 精确为 `dpl_A2n…` / READY / Production，没有用 Preview 重建冒充验过的构建。
- 正式 health 200 / database ok；匿名 session 401 / authenticated false，两个 Eval 管理员 API 均 401。
- Chrome 原账号整页刷新仍为个人工作区、8 个准备岗位、原简历和 6 处待确认建议。一般输入实测内外 border 0、仅语音与发送；顶部设置展开能读到正式模型目录与价格顺序，Escape 关闭/回焦通过，未更改原模型/模式选择、未发送消息。简历补问白色输入面及内置发送正常显示。
- 原 Eval 后台刷新仍为“正式站 · 管理员”，22 条当前正式记录、既有 Trace/Agent I/O 与人工反馈 `a3f3dfd9…` 可读；外层 body 为空是后台 iframe 的 DOM 边界，不是白屏，以实际 AX 与截图确认。未编辑或新建后台记录。
- 正式回读：41 旧作答、33 全站资料、本人 10 资料条数及上述整行 hash 全部一致；wallet/transfer/reservation 仍各 0。未触发真实模型改稿、充值、兑换、短信或扣积分。
- **Post-deploy observability：** 本部署最近 10 分钟、最多 30 条 error 日志查询为空；现有项目 Drains 0，属于长期监控缺口，不宣称短窗无错等于长期健康。浏览器可见一条第三方扩展 share-modal.js 的历史 TypeError 和未展开 Object 日志，未冒称控制台全部无错，也未修改扩展或扩大修复。
- 实际截图：`/tmp/yizhi-cend-acceptance.zlA2nd/production-desktop.png`；桌面/手机示例截图与本地失败夹具证据同目录。隔离服务及本次两张本机页面已关闭；临时视口已恢复。原账号与后台标签保留。

旧域到期不续、积分兑换暂缓及其余历史产品待办不变。本次没有重新验短信、正式支付或 PDF；这些流程未被本补丁修改。ME 共享 index 含协作者暂存，仅更新本线记录，不提交/推送 ME。
