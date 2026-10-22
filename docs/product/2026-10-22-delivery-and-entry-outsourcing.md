# 最终交付埋点、失败修复与四种起点：外包交接

状态：2026-10-22，本人要求交外部工具实现，由本人通知；本文件为实现与验收任务书，**不是已修复、已部署或外部已接单的证明**。本轮 Codex 只核代码与证据、定口径、写交接，不与承接方抢改实现。

实际代码仓库：`/Users/yi/Documents/Codex/yizhi-resume-block-repair-1016`。本次核对 HEAD 为 `d2983bb`，工作分支 `codex/resume-detail-polish-1017`；正式运行版为 `0bdaafa`。开工时再次核状态，勿按名字另找旧 clone。`/Users/yi/me` 是业务真源，不是产品代码仓库。

## 0. 通知与执行顺序

- **Grok：先读第 1–4 节，做后端最终结果口径、失败诊断/修复和确定性回归。先交共享事件/响应类型，再补实现。**
- **Qoder：先读第 1、2、5–7 节，做四种起点、首页到登录后工作区的真实接线及客户端展现/保存回执。** 可先用测试 fixture 做组件，不等 Grok 完成全部修复。
- Codex：验收两包、核真正模型/保存/刷新/PDF证据，审核迁移与发布，核正式版本和旧数据保护。承接方不部署、不发短信、不跑真实用户模型、不改积分或用户凭据。
- 本次分工取代 `2026-10-19-eval-outsourcing.md` 中“Grok仅做盲评”的旧限制；旧文档对应历史任务，不覆盖这次明确授权。
- 只有需要修的当前问题才改。`0edf9ff` 已发布的质检协议自修/原编辑一次返修、讨论不自动改稿、逐问、模型菜单、聊天与PDF链路不能重复重写或回退。

## 1. 不可破坏的边界

1. 不修改、合并、清洗或重放真人旧简历、作答、补充、对话、积分、兑换或连接模型凭据；不读密钥文件、不输出敏感字段。
2. 不在本人账号/其他真人账号上测模型；外包阶段只用明确虚构材料、mock、失败注入和现有匿名元数据。真实模型验收由 Codex 单独核费用与权限后安排，不沿用已经用尽的“两次用户 TokenDance 测试”授权。
3. 免费仍是**同账号仅一次、仅一段工作/实习/项目经历**，不是整份免费或每天重置。选入口、刷新、换 JD、新建会话不能重置权益。普通保存是否免费沿现行能力，不把 AI 动作写成免费。
4. 默认保留原稿、格式/项目符号/领句及责任边界；缺数字不编数字，JD不是用户经历，修改指令不是事实补充。
5. 模型选择留在输入区左下，保留 logo、紧凑行高及选择刷新恢复；保留气泡、Markdown渲染、结构化回复与逐步显示。讨论不是每条消息都触发编辑。
6. 共享脏树里已有 Cursor/DS 首页、工具栏、处理摘要、打印模板等改动，不能覆盖、全文件格式化、`git add -A`、stash/reset/clean。只交本包 diff、文件表和测试证据，不自行提交/推送/部署；如需独立提交先交 Codex。

## 2. 共同结果口径：这些不是同一个成功

| 层级 | 可据什么判断 | 不能声称什么 |
|---|---|---|
| 上游模型调用 | `ai_generation_events.status` | 不能据 success 说已改稿/已保存/用户看到了 |
| 生成可用提案 | 事实、原文定位、独立质检、整稿和格式门禁通过 | 不能据 HTTP 200 或有 changes 数组说已交付 |
| 服务端可取回的交付 | 对应 generation 的提案已持久化，当前 owner/版本读取得到 | 尚不能说浏览器展示、用户采纳或PDF已保存 |
| 浏览器已展现 | 同 generation 的真实渲染确认 | 不能说用户认可或云端采纳保存成功 |
| 采纳并保存 | 用户显式采纳后，服务端确认对应文档 revision 已存 | 不能据按钮点击或乐观UI标“已保存” |
| 导出 | 请求打印、用户确认保存、服务端产出文件分别记录 | `window.print()` 或 afterprint 不是实际PDF文件落盘证明 |

最小工作流：发起尝试 → 调用/检查/必要的一次返修 → 判定业务结果 → 持久化对应结果 → 展现确认 → 用户采纳/保留 → 文档保存确认。失败可以发生在任一步；缺信息、保留原文、额度不足不是改稿成功，也不能全部混成模型故障。

### 2.1 新统计口径（实施契约，不冒充当前接口）

优先复用 `product_events`、`resume_agent_trace`、任务版本与已有 Eval observer，不再搭一套孤立埋点系统。新记录标 `schema_version=2`。以下为本包建议固定事件名，Grok先实现导出类型及白名单；若代码冲突需改名，在交接中明确同义映射，不能两套并存双计。

- `resume_task_started`：仅在服务端真正拿到某一代任务 lease 后记录。点击、重放响应、普通 discuss、刷新读取不新增尝试。
- `resume_task_outcome`：服务端权威结论。至少区分 `delivered / partial_delivered / unchanged / needs_detail / blocked / failed / quota_denied`；未结束为 `running`，缺结尾或时限过了仍无权威回执为 `unconfirmed`，不能补造 failed/success。
- `resume_result_presented`：客户端真实展示该 generation，和后端“结果已存”分开。按 generation 去重，不因刷新或 StrictMode 重挂增加次数。
- `resume_change_decided`：显式接受/保留某条修改，带真实 change ID 与 generation；点击意图和服务端确认不能混报。
- `resume_document_persisted`：只在对应文档 revision 云端确认后记；失败/未确认另分状态，保留输入。
- 保留 `resume_print_requested` 的原含义；不要新增一个未经实际证明的 `pdf_saved` 成功事件。

字段至少包含：服务端确定的 owner（不接客户端任意 userId）、attempt/generation标识、task ID、source revision、Trace ID、可用时的 Eval run ID、动作类型、最终 outcome、固定失败 stage/reason code、真实开始/结束/耗时、变更数量、部分交付/追问状态、workflow/code 版本。只读关联真实修改 ID，不拿段落编号代替；未生成则 null。lease/token 不得回传客户端或写分析事件。错误正文、简历/JD/对话原文不进普通埋点；原始I/O只经现有受保护 Eval 捕获。

去重用**一次真实执行代次**，不是只用 task ID（同任务可重试或补问后再改）。可复用当前 `resume-task:<taskId>:<version>`/`resumeGenerationId`，但版本计算必须由服务端实际返回，不让前端猜 `version-1`。事件幂等键包含事件类型与代次；change决定还需对应决策/文档revision。重复HTTP、历史任务回读、同代次重放均不能增加生成成功数。

业务结果必须检查**本次新增且保留的有效修改**；不能把先前保留的 changes 算成本轮新交付。`ready`、`ok:true`、`unchanged:true` 和“有一条补问”要结合本次结果判定：无改动为 unchanged；安全部分可取回且有未完成部分为 partial_delivered；只追问没有修改为 needs_detail；安全部分先交付不受补问阻塞。

看板至少并列“发起尝试/可执行尝试/可取回完整交付/部分交付/未改动/待补信息/阻断与失败/未确认”，注明分母和新口径启用时间。额度拒绝与前置输入拒绝单列；业务失败按代次计，上游调用按 call 计，不合并成用户数。本人/确认关联与测试排除沿当前 `analytics-cohort` 规则，不前端隐藏，不改旧源表。

旧 `resume_generation_*` 只能标历史客户端覆盖；不能和新任务事件相加。历史 Trace 仅作有证据的诊断明细，可只读派生展示并标“历史/覆盖不完整”；不倒填历史缺失展现、采纳、PDF或原始I/O。

## 3. Grok 包：实现位置与当前已确认缺口

主要范围：

- `lib/coach-harness/resume-execution.ts`（真正核心；route.ts只是一层入口）
- `lib/coach-harness/resume-task.ts`、`resume-task-types.ts`、`resume-trace.ts`
- `app/api/coach/resume-agent/route.ts` 与现有测试、`app/api/coach/resume-draft/route.test.ts`
- 新增独立的 outcome分类/事件写入模块及测试，避免继续扩大主函数
- `lib/product-events.ts`/测试、必要的服务端事件接收校验、`lib/admin-analytics.ts`/`admin-analytics-store.ts`及测试
- 管理员 analytics 接口增只读版本化结果；默认兼容旧调用，不把匿名/其他账号资料泄露给C端。

本轮读代码确认：

1. 旧客户端 `resume_generation_*` 只挂在 `CockpitApp` 的旧生成路径；实际 `runResumeAgent`/导师决定 revise 的执行不经过那段，故漏记业务失败。
2. `startResumeTrace` 已有服务器 checkpoint 与最终 outcome，但普通 analytics 排除了 `resume_agent_trace`，不能据旧功能列表算新改稿成功率。不要简单把所有 checkpoint 各算一次活跃/完成。
3. `resume-execution.ts` 当前先 `finishResumeTask` 持久化，再 `finalizeQuota`，之后才设 `outcome=completed`；`resume-agent/route.ts` 已有“后续响应异常时读回已提交代次”的恢复。**需专门测试提交已成、后续结算/传输报错的观测一致性**，不能把可读回的成功稿标成丢失，也不能因为埋点重跑或重扣。不得改积分计算/额度规则来解决观测问题。
4. `outcome` 默认 failed，最终Trace写失败会留 running；要暴露观测未确认，别用丢失的结束事件伪造失败或成功。
5. 当前无机会的直接 draft 可 `draft_returned_without_opportunity`，不是已保存到工作区；若保留该调用方式须单列“仅返回、未持久化”，不能混入服务端可取回交付。

Grok在共享类型中定义一个可供Qoder消费的精简 `delivery` 回执（可作为现有任务/响应的可选扩展）：schema版本、generation/attempt/Trace/Eval关联、outcome、交付数量、持久化确认状态、失败stage/code、retryable。历史无字段为unknown，不猜成功。不得把私有prompt/I/O放进C端回执。共享类型与枚举先单独交文件，Qoder不要用 `any` 绕过。

### 3.1 失败诊断与修复优先级

匿名历史证据：两非内部账号在10/19与10/21共11次Trace失败；StepFun `step-3.7-flash` 的20次 draft上游调用为12空回复、4超时、4成功，调用成功不等于最终交付。证据索引见同目录 `2026-10-22-delivery-badcases.json`。这不是10/22新版失败率；不能据旧Trace推断尚未修复的具体协议/供应商根因。

先读 `docs/operations/2026-10-22-review-repair-acceptance.md`。当前已修 reviewer协议错误错派编辑；现有 transport也已接上游活动、私有JSON缓冲与请求预算。先用当前版本 + 虚构fixture重现/失败注入，再决定最小修复；已被当前回归覆盖的问题保留，不为“修过了”再重写。

必须查清：空回复是上游无最终content/输出截断还是协议解析失败；首字/总时限与整条工作流预算分别在哪耗尽；review协议失败与正文缺陷是否仍错误触发原编辑；并发/旧lease/保存失败是否被误报模型错误；提交后恢复是否拿到同generation。保存固定诊断码/finish_reason/阶段耗时等安全元数据，不保存供应商隐式思考。

禁止靠无限重试、整体放宽质检/事实门禁、静默换模型、只加重试按钮、清理历史数据、改付费限制来宣称修复。新增收费调用或更换用户选定模型前先报告，不自行执行。

### 3.2 Grok 必须交的确定性回归

- 模型200/success但JSON无效/空/截断；正文未通过事实或格式门禁；质检协议自修仍失败：均不能记 delivered。
- 最多一次原编辑返修；质检协议自修不消耗编辑返修，也不改已被事实支持的候选。
- 真实安全修改+追问 → partial_delivered；只追问 → needs_detail；没必要改 → unchanged；讨论消息不进入改稿分母。
- CAS失败/旧lease/原文被更新不覆盖新版；并发重复不重复调用/计数；新代次重试可区分。
- 提案提交后后续错误、客户端断线、刷新重放：已有稿可恢复，不倒写failed，不重跑；采纳未确认不能报document persisted。
- Trace初始/结束写失败分别处理；running长期无回执标unconfirmed，不倒填终态。
- 正式/QA/本人排除与旧口径隔离，管理员权限、跨owner拒绝仍过。
- 既有 `resume-agent`、`resume-draft`、`resume-trace`、`resume-task`、conversation决策/恢复与analytics测试，类型检查与作用域lint。无真实模型/短信/积分交易。

若实现确需数据库迁移，先交迁移候选、兼容性/回滚策略与测试；不在正式库执行、不全表回填。埋点可追加，不能把旧作答、正文或积分带进迁移。

## 4. 后台怎样看见结果

先做同源管理员 API + 计算测试，允许既有数据页读取新增口径；不改已上线整页布局。最小展示只需：按运行代次查看最终结果、卡点stage/code、Trace/修改ID、完整/部分交付与未确认状态；可按workflow版本区分历史和当前。不要拿上游success百分比替代业务交付率。

Grok不得并发改Qoder的C端文件。需要后台小组件时新增隔离组件或由Codex接线；回执和数据枚举写进交付报告。原始测试输入/输出、质检/返修过程通过已有 Eval observer完整捕获，开发记录按块关联现有run/Trace/change，旧缺失留空。

## 5. Qoder 包：四种起点，一份材料就能开始

**当前本人要求优先于旧三入口文案。** 视觉沿已确认的DS入口B，不重开全站视觉方案：

- 原型：`/Users/yi/me/益职作战盘/assets/2026-10-22-entry-b-final/entry.html`，参考截图 `entry3.png`。
- 现有在途实现 `app/HomeLanding.tsx` / `.module.css`，`app/page.tsx`；暖光干净底、既有标题字体、留白与克制交互保留。
- 旧 `.impeccable/surfaces/app-page-tsx.md` 记录10/14方案，不覆盖后续DS入口B及本人这次四种起点；不要为文档漂移改全站DESIGN或伪称新稿已获审美批准。
- 开始页不是另一个巨大聊天框，也不是长表单/导览。先选手头有什么或想做什么，选中后只展开对应最小输入；任务开始后进入已有导师聊天。

| 起点 | 首个动作 | 真实去向与边界 |
|---|---|---|
| 我有简历 | 上传或粘贴简历 | 保存/读取基础材料，不要先逼填JD。可继续讨论、判断方向或选择一段体验；不能自动免费改整份 |
| 我有JD | 粘贴岗位原文或招聘链接 | 走现有导入，先整理该岗位要求；无简历时下一步只问最关键经历，不能生成个人匹配分 |
| 帮我找岗位 | 写方向或选择“还不确定” | 有已存资料时复用；无简历也能先开始聊方向/地点/硬条件，一次问一个。形成足够档案后再用真实找岗链路，不展示虚构招聘或自动触发付费批量推荐 |
| 我先说一句 | 输入当前困惑，或点示例带入 | 进入可无opportunity的普通导师会话；不能强行按简历解析、让其先传简历或直接启动编辑 |

示例选项只帮助表达，不是给人贴身份：`不知道自己适合什么`、`想转行，不知道从哪开始`、`有目标岗位，想看看差距`、`快面试了，想先练一练`。选择后可改内容再开始；首次开始给一个可回答的问题或基于已有材料的具体判断，不同屏连问三题、不给默认80分、没有JD不造匹配度。

### 5.1 现有实现缺口与接线位置

- `app/HomeLanding.tsx` 目前三门中“只有简历”跳 `/tools/resume-jd-gap`；该公开免费对照工具不能冒充登录后的AI改稿主线。免费工具独立链接保留，四种主入口分别带入正确工作区状态。
- `components/cockpit/CockpitApp.tsx` 的 `EmptyCockpit` 仍主推“先给我简历”；`NewOpportunityForm` 是 direction/resume/interview三选，不能只改标题不改行为。
- `EntryGate.tsx` 是历史“学习/投递/面试/谈薪”的计划面板，不是这次主材料入口；不要误删其旧功能。
- 基础材料沿 `createOpportunity` → `/api/opportunities/analyze` → `/api/coach/opportunities` 的已有链路，继续保存与请求幂等机制；`/api/opportunities/intake-info` 只是费用/模型提供方说明，不是分析入口。不要另做假上传/假保存。
- 无简历的一句话/方向讨论优先复用 `AgentConversation`，其 `opportunityId` 可选，已有 `/api/coach/agent/sessions` + `/api/coach/agent` 支持普通会话。不要调用必须 `ownedResumeTaskSource` 有简历的 `resume-agent` 来冒充普通聊天；不要建空假简历骗过校验。
- 找岗已有 `/api/coach/jobs/discover`，目前需要已保存的基础简历与方向；不是 `/api/coach/research`（后者是公司调研）。入口阶段可从无资料开始逐问，不为绕过前置条件给旧API塞假经历；真正推荐继续沿筛选/原文来源/地点/硬门槛与现有费用边界。若需改后端，交Grok补独立适配而不放松核心检索规则。
- 保留老用户当前机会、最近会话与材料。旧账号登录后不能强制回新手入口，添加材料/新会话另走显式入口，不覆盖旧记录。

Qoder独占修改首页在途组件、`CockpitApp`的入口/空状态/新建材料部分及抽出的新组件、必要的 `AgentConversation` 外层接线和前端测试；不重写其流式/Markdown/模型路由核心，不触碰打印、简历纸面和后端状态机。

### 5.2 入口状态、恢复与动效

1. 首页四门 → 已登录到对应工作区状态；未登录先正常登录并恢复已选起点。只在URL传枚举，不把简历/JD/困惑正文塞进URL、分析事件或日志。
2. 选择不自动发模型请求、搜索或消耗权益；明确提交才开始。例句先填入可编辑输入，不自动改稿。
3. 切换起点保留尚未提交内容，不串到其他用户/其他材料；刷新恢复能恢复的草稿/会话，浏览器不能跨登录恢复的文件明确要求重选，不谎称文件已上传。
4. 处理中能看见实际阶段；失败保留材料，区分导入/分析/保存/回复/改稿。入口不遮住返回、讨论或输入区；不要求失败后重新填整份。
5. 轻动效只解释“选中起点→对应输入展开→任务运行→真实结果出现”；不演假进度，不新增整页向导。尊重reduced-motion，移动端和键盘可用，聚焦避免粗大彩色外框但保留清楚键盘焦点。
6. 首页与空工作区最多四个同层入口；保留DS的字体分工和层级，不用一堆字体/状态颜色。删未核的“固定3题/固定3类岗位/保证3–5分钟出结果”等承诺；免登录/本地不上传只描述真正本地工具，不扩成云AI流程承诺。

### 5.3 客户端埋点（与Grok共同契约接线）

Qoder只埋真实选项/提交/渲染/保存回执，不伪造服务端终态。入口事件建议 `entry_selected / entry_submitted / entry_result_presented / entry_failed`，由Grok先加入事件白名单。属性仅 `entry_kind=resume|jd|find_jobs|one_sentence`、页面类别、submission/request/generation关联、安全阶段/固定错误码、是否复用已有材料；不带正文、文件名、手机号或完整链接。

必须区分“选了但未提交”“材料已存但AI未完成”“已看到首次回复”“已有可取回修改”。重挂/重渲染/刷新不重复当新提交。旧 `material_intake_*` 保持含义，仅在确实导入材料时发送，一句话聊天不冒充导入成功。

`delivery`字段未到位时不得自行猜ready=delivered；开发可显式使用虚构fixture，正式缺失则显示未记录。编译依赖共享类型先由Grok交；不要用 `as any`、改旧事件语义或到处双写临时规避。

## 6. 文件占用与交付要求

开工先看 `git diff -- <目标>`，区分已有修改。当前共享脏文件包括 `DESIGN.md`、`app/page.tsx`、`app/cockpit/preview/page.tsx`、`CockpitApp.tsx`、`ResumeAgentConversation.module.css`、`ResumeExport.tsx`、`ResumeProcessingReceipt.tsx`、`Whiteboard.tsx`、`lib/resume-print*`、`resume-template-preference.ts` 等；另有未跟踪HomeLanding/字体/验收截图。**不等于这些全归本任务。**

- Grok不改C端上述UI/打印；Qoder只在已分配入口段接线，不把前辈所有dirty一并交包。
- 双方分别交 `docs/operations/2026-10-22-delivery-grok-handoff.md`、`docs/operations/2026-10-22-entry-qoder-handoff.md`：文件/函数清单、改前改后、测试命令与实际输出、已知问题、对方必须接的契约、未验证项。
- Grok附同一代次事件示例（虚构）及最终口径计算；Qoder附1440/390截图与四入口交互证据、错误/恢复状态。
- UI完成后对本包真实改动的UI文件手动一次Impeccable detect，集中修新增问题，最多一次复核；不重开自动钩子，不扩修旧告警。本任务书仅文档，本轮不扫描历史UI。

## 7. Codex 联合验收与发布门槛

先接Grok契约与后端，再接Qoder小范围接线；只部署经检查的干净候选，不从共享dirty树直接deploy。

1. 后端失败注入全部通过；同一次运行的模型calls、Trace、任务、持久化结果与新口径一致，模型成功但交付失败的案例必须能在Eval中定位。
2. 四种起点都走真实现有接口，缺材料可开始；首页→登录恢复、无简历聊天、老用户原会话、切入口、返回、失败保留输入、刷新不重复请求与计数均实测。
3. 使用明确虚构的完整事实、信息不足、较长多段落三类简历做有界真实模型验收。安全部分可先交付、导师一问一问、说记不清不误改。费用/预算未明确先报告，不使用真人连接模型/积分钱包。
4. 至少对成功的修改实点采纳→云端确认→刷新回读同generation/change/revision；保存失败注入不能报已保存。模型选择和原聊天体验再回归。
5. 真正写出PDF并检查文件文字/排版/bullet/尾页；打印预览、afterprint或按钮触发不替代实际文件验收。
6. 新真实测试启用已有受保护Eval原始捕获；输入/输出、原因、返修与最终结果按块存开发记录并关联真实run/Trace/change。历史缺失不补造。
7. 发布前后按已有方法核旧作答、原机会/任务内容和积分基线不变；只允许隔离QA新增数据与新遥测。只清本轮明确QA，不能清真人失败事件来让成功率好看。
8. 验收通过才由Codex按原流程上线，并核 `yizhioffer.com` 正式版本/登录刷新/权限；保留当前正式与上稳、旧域不续。不买新服务、不改OAuth/短信/积分兑换。

若某路径或真实费用权限未就绪，交付中明确写未验证，不能用mock、测试数或“模型success”抵掉门槛。
