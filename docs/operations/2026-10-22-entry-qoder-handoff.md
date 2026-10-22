# 四种起点入口：交付、真实接线与未验清单

2026-10-22（America/Los_Angeles）。任务书 [§5 与 §6](../product/2026-10-22-delivery-and-entry-outsourcing.md) 的外包包：把首页与空工作区的三个门改成四个材料起点，只交本包 diff、文件表和测试证据。**未提交、未推送、未部署**；共享脏树里 Cursor/DS 的在途文件未覆盖、未格式化、未 `git add`。全部行为证据来自 dev-only `/cockpit/preview?empty=1`（`dataMode="demo"`、`cockpit-preview@example.com`）与明确虚构材料，未在任何真人账号上跑模型、未消耗额度、未写生产库。

## 文件表

新建 11 个代码/测试文件、945 行；修改 6 个文件、`+231 / −53`；本文与 `docs/product/evidence/2026-10-22-entry/` 的 27 张图是 §6 交付物，不计入代码行。

| 文件 | 行 | 作用 |
| --- | ---: | --- |
| `lib/entry-doors.ts` | 100 | 四门唯一真源：枚举、文案、URL 只放枚举、门→intake 映射 |
| `lib/door-drafts.ts` | 95 | 未提交文字与「曾选过文件」的 sessionStorage 状态，按账号隔离 |
| `lib/entry-telemetry.ts` | 93 | 四个客户端事件、固定阶段/原因码、跨 remount/刷新去重 |
| `components/cockpit/StartDoors.tsx` | 122 | 门壳、门 3/4 的输入与例句带入、对话外层 |
| `components/cockpit/StartDoors.module.css` | 64 | 入口样式（发丝线、6px 圆点、细焦点环） |
| `components/EntryTrackLink.tsx` | 20 | 首页保持服务端组件的同时记录选门 |
| `app/HomeLanding.tsx` / `.module.css` | 111 / 120 | 四门首页与其排版 |
| `lib/entry-doors.test.ts` / `door-drafts.test.ts` / `entry-telemetry.test.ts` | 53 / 75 / 92 | 上述三个纯模块单测（20 项） |
| `app/page.tsx` | +55 | 挂载 `HomeLanding`，新增标题/描述与首页 JSON-LD |
| `components/cockpit/CockpitApp.tsx` | +183 | 空工作区改为四门；`NewOpportunityForm` 加 `hideChrome`/`onDraftChange`/可选 `onCancel` |
| `app/cockpit/page.tsx` / `app/cockpit/preview/page.tsx` | +7 / +27 | URL `?entry=` 只解析枚举后进 `initialEntry` |
| `components/cockpit/CockpitApp.module.css` | +1 | `.createBare`（无外层页头时表单占满） |
| `lib/product-events.ts` | +11 | 本包只加 `entry_selected/submitted/result_presented/failed` 四个名字 |

另新增 4 个首页依赖的自托管字体（`public/fonts/`，未入库、`public/fonts/README.md` 目前只登记 Outfit）：`instrument-serif.woff2` `42072c0b…b841`、`kode-mono.woff2` `f513a63e…94c7`、`smiley-sans-sub.woff2` `c8324bae…b944e`、`space-grotesk-var.woff2` `06408904…ce9d`。**来源与授权记录缺失，提交前须补齐**，本包不替它们自证许可。

未动：打印与简历纸面（`lib/resume-print.ts`、`ResumeExport.tsx`）、后端状态机、`AgentConversation` 的流式/Markdown/模型路由核心、`components/cockpit/EntryGate.tsx`（636 行，学习/投递/面试/谈薪入口全在）、`app/tools/resume-jd-gap/`。`lib/product-events.ts` 同文件里的 5 个 `resume_*` 名字、`app/cockpit/preview/page.tsx` 的 `previewRunTask`/`?run=1` 与 `CockpitApp.tsx` 的 `initialResumeTask` 种子属处理摘要在途工作，非四门必需，未回退也未按本包名义认领。

## 门 → 真实链路

四门在 `!active && !creating` 时替换 `EmptyCockpit`；已有材料的账号登录后直接进工作区，不会被拉回新手入口（`23-existing-account-not-forced-1440.png`）。「添加材料/新会话」仍走原显式入口，不覆盖旧记录。

| 门 | URL | 提交后真实去向 | 边界 |
| --- | --- | --- | --- |
| 01 我有简历 | `/cockpit?entry=resume` | `NewOpportunityForm`（`intakeEntry=direction`）→ `createOpportunity` → `/api/opportunities/analyze` | 只存基础材料，不先逼填 JD；不自动免费改整份 |
| 02 我有目标岗位 | `/cockpit?entry=jd` | 同一表单（`intakeEntry=resume`），走既有 JD 导入与整理 | 无简历时下一步只问最关键经历；不生成个人匹配分 |
| 03 帮我找岗位 | `/cockpit?entry=find_jobs` | 显式提交后建 `CoachingStart`，挂未改动的 `AgentConversation`（`/api/coach/agent/sessions` + `/api/coach/agent`） | 一次问一个；不调 `/api/coach/jobs/discover`，不为搜岗编造材料 |
| 04 我先说一句 | `/cockpit?entry=one_sentence` | 同上，普通导师会话，无需 opportunity | 不强行按简历解析、不启动编辑；不调 `resume-agent` |

门 3/4 的例句 chip 只把文字写入可编辑输入框，不改写已有内容、不自动提交、不发起任何请求；提交按钮文案含真实额度标签。旧 `NewOpportunityForm` 的三选（先给简历/已有目标岗位/准备面试）行为未变，只是被四门包裹时隐藏了自己的页头（`hideChrome`），不是只改标题。免登录工具 `/tools/resume-jd-gap` 仍是首页/页脚的独立链接，没有冒充主线。

## §5.2 纪律落点

正文只活在输入框与 sessionStorage，URL 只允许四个枚举值（`parseEntryKind` 拒绝其他值），分析日志拿不到简历/JD/困惑文本。选中门不触发模型、搜索或额度——必须显式提交。刷新后文字草稿恢复，`File` 无法恢复就明说「需要文件请重新选一次」，不谎称已上传。跨账号不恢复：payload 里 `someone-else@example.com` 读回空草稿、不显示提示。失败按 `intake/analysis/save/conversation/restore` 阶段和固定原因码分开报，材料保留，保存失败区分于分析失败并明写「重试保存 · 不消耗模型额度」。动效只有选中→展开→运行→结果，`prefers-reduced-motion` 下门按钮 `transitionDuration` 实测 `0s`；键盘一次 Tab 即到达例句 chip，焦点环 `solid 1px rgb(148,68,41) offset=2px`（细线，非粗大彩框）。首页与空工作区同层入口都是四个。首页文案已无「固定 3 题/固定 3 类岗位/保证 3–5 分钟出结果」类承诺，「本地完成、文字不上传」只用于真正的本地工具。

## 埋点契约（给 Grok）

`entry_selected`（`entry_source=url|click`）/ `entry_submitted`（`submission_id`、有则 `request_id`、`reused_material`）/ `entry_result_presented`（`submission_id`、`request_id`、`deferred`）/ `entry_failed`（`stage`、`reason_code`）。属性仅 `entry_kind=resume|jd|find_jobs|one_sentence`、`page_category`、提交/请求关联、固定阶段与原因码、是否复用已有材料；不带正文、文件名、手机号、链接。去重：选门按 kind 记在 sessionStorage（刷新恢复同一选择不算新选择），提交/呈现/失败按 `submissionId` 内存 once，StrictMode remount 与刷新不重复计数；`resetEntryTelemetryForTest()` 供测试清态。旧 `material_intake_*` 语义未改，本包事件是客户端「浏览器做了什么」层，服务端投递/额度结论仍以服务端事件与 `delivery` 回执为准——**`delivery` 字段未到位前不要自行把 ready 猜成 delivered**。四个事件名由我先加入 `PRODUCT_EVENT_NAMES` 白名单，待 Grok 复核后正式认领。

已区分：选了未提交（仅 `entry_selected`）/ 材料已存但 AI 未完成（`entry_submitted` 后无 `entry_result_presented`）/ 已看到首次回复（本包只在真实渲染出机会时发呈现事件）。**未接**：门 3/4 的「已看到导师首条回复」与「已有可取回修改」两态本包未发事件，需在 coach turn 落库处由 Grok 发 `entry_result_presented`；遥测整体门在 `dataMode === "live"`，示例工作区不产生事件（施工判断，待郭屹复核）。

## 测试与类型

```
NODE_OPTIONS=--experimental-vm-modules npx jest lib/entry-doors lib/door-drafts lib/entry-telemetry
→ Test Suites: 3 passed, 3 total / Tests: 20 passed, 20 total
npx tsc --noEmit → exit 0
```

全量 `npx jest`：`Test Suites: 1 failed, 5 skipped, 276 passed / Tests: 13 failed, 10 skipped, 2708 passed`。唯一红灯是 `app/api/resume/upload/route.test.ts`（期望 400、实得 403，来自 `lib/metered-ai-route.ts`）；该测试文件、被测路由与其依赖在本仓库工作树里均无改动条目，属 HEAD 既有红，非本包引入，未代其他人修理。`components/cockpit/cursor-frontend-acceptance.test.ts` 仍 2/2 绿（见冲突）。Jest `testMatch` 只收 `*.ts`，组件没有 jsdom 单测，交互/错误/恢复行为只能靠下面的浏览器实拍——这是仓库既有约束，不是本包跳测。

## 浏览器证据 27 张

`docs/product/evidence/2026-10-22-entry/`，真宽已核：19 张 1440×900、8 张 390×844。采集用一次性 headless Chrome + 原生 CDP（视口/网络/`prefers-reduced-motion` 仿真、真实 Tab 键、React 受控输入走原生 setter + `input` 事件），脚本与该 profile 目录是本会话私货，已随交付删除，复现需按上述口径重写驱动；MCP 截图工具不能用：`chrome-devtools` 的 `filePath` 被限制在它自己的 workspace roots，`browser-use` 渲染成 1050px 宽且无仿真能力。

| 文件 | 证明 |
| --- | --- |
| `01/02-landing-1440` | 首页无未核承诺、四门并列与产出行 |
| `10–13-doorN-*-1440` | 四门各自只展开对应输入，`aria-pressed` 单真 |
| `14-door4-chip-filled` | 例句带入后可编辑，`25-…-no-auto-request` 同态下网络列表 `[]` |
| `15-door4-chat-surface` / `16-door4-back-to-doors` | 显式提交才挂对话、「← 换一个起点」回到空门 |
| `17-door1-inflight` / `18-door1-failure` | 真实阶段文案；失败保留 59 字材料并显示 `未认证 · 任务编号 768573de-…` |
| `19-draft-restored-filelost` / `20-draft-restored-jd` | 刷新恢复文字、文件需重选，不谎称已上传 |
| `21-keyboard-focus-1440` | 一次 Tab 命中 chip 且焦点环为 1px 细线 |
| `22-reduced-motion-1440` | 降级动效下 `transitionDuration: 0s` |
| `23-existing-account-not-forced-1440` | 非空账号不出现四门 |
| `26/27` | 刷新恢复的是对话；离开后 `chatOpen` 标记清回 `null` |
| `30–37-*-390` | 移动端首页/四门/门 4 对话/门 2 失败态 |

## Impeccable detect（只跑本包 UI 文件）

`impeccable detect --no-advisory components/cockpit/StartDoors.tsx components/cockpit/StartDoors.module.css components/EntryTrackLink.tsx` → **exit 0**。上一轮的 `side-tab` 硬伤已按 T-07 改掉：`.fileLost` 从「2px 左边条 + 着色块」换成 6px 圆点，重算 `border-left-width: 0px`、`::before` 为 6px `rgb(192,122,79)`，证据图已重拍。

首页两文件另有 **10 条 primary，全部是 `design-system-font`**：`Smileysub / Instrumentserif / Spacegrotesk / Kodemono` 四个 `@font-face` 家族未登记在 `DESIGN.md` typography。两条路（本包不自决）：把首页品牌字体作为有意新增补进 `DESIGN.md` + `public/fonts/README.md`，或让首页回落到已登记的 Outfit/Noto 栈。另有 **54 条 advisory**：首页与入口 CSS 的色值、圆角（`2/8/15px`）、字号（`9/21/23px` 与三处 clamp 端点）超出 `DESIGN.md` 档位，属需要一次设计系统补录的漂移，不判为缺陷。`DESIGN.md` 当前是他人 in-flight 的 `M` 状态（墨底白标/蓝标斜切那两行），本包未编辑。

## 冲突与待裁定（交 Codex）

1. **首页换组件的连带影响**：`app/page.tsx` 现挂 `HomeLanding`；`app/HomeClient.tsx`（268 行）与 `app/Home.module.css` 内容一字未改，但已从 `/` 摘掉不再渲染。因此 Cursor 的 `cursor-frontend-acceptance.test.ts:12-19` 依旧绿——它断言的正是这两个已不挂载的文件（`简历修改 · 虚构示例`、`模拟面试 · 互动演示`、`finally { setSharing(false); }`、`图片生成受限时仍可复制文字` 在 `HomeLanding.tsx` 里 0 命中）。这个绿不再覆盖真实首页，需要 Codex 决定：要么四门首页补上这些能力，要么把该断言移到新文件。**本包不删他人文件。**
2. 换组件后首页丢失的内链与展示件：分享卡复制/下载、Agent 安装指令复制（`#local-board`）、`/guides/resume-without-metrics`、`/tools/interview-review`。后两条是 SEO 包（`2026-10-21-seo-geo-acceptance.md`）的公开页内链，是否需要补回请一并裁定。
3. 门 1/2 提交成功后直接落到该机会话，**绕过了 `MaterialReceipt`**（回执只在旧「添加材料」表单路径出现）。要保留回执就得改活动切换时序，超出本包接线范围。
4. 首页 JSON-LD（Organization/SoftwareApplication/FAQPage）是本包新加，HEAD 首页无结构化数据；`offers.price = 9.90 CNY` 对应 `docs/operations/watcha-pay.md` 里已上架的 10 积分体验包，不是本包新定价。与 SEO 包是否重复由 Codex 判。
5. 待郭屹批准才能验的真机路径：登录后门 1/2 真实保存、门 3/4 真实首句发送与回复（示例工作区不会发送排队首句，这是 preview 局限而非缺陷）、付费/额度交互、生产库写入。

## 未扩张

不改积分与免费口径（仍同账号仅一次、仅一段经历；选门、刷新、换 JD、新建会话都不重置权益）；不合并/清洗/重放任何真人旧简历、作答、补充、对话、兑换或模型凭据；不读密钥文件、不输出敏感字段；不动打印、简历纸面与后端状态机；未 commit/push/部署，Feishu 未推送。遗留任务 #107、#100、#85/#87/#88/#89、#101（JD 链接导入被 SSRF 闸挡掉）与 `/guides` 白名单不在本包内处理。
