# OpenAI Developers 对照：益职 Harness 当前审查

日期：2026-10-13。

后续状态：H-01/H-02 已修复，旧原话检索与简历可见性已补并做真实模型/Chrome 验收。正式运行时 7e6dc16；见 [修复验收](2026-10-13-harness-recovery-acceptance.md)。以下审查保留原版本证据，不将其未修项一并写成完成。

## 结论

益职已经有真实可用的业务 harness：材料分层、上下文编译、流式协议、事实回指、保存后确认、阶段需用户确认、任务台账与部分缓存都已接线。它不是只有一段 system prompt。

但目前不能签收为可靠的“长期导师”。本轮复现两项最高优先级恢复/幂等问题，以及两项上下文问题；质量评测仍未闭合。优先补现有链路，不需要为了使用插件把整个产品迁移到 OpenAI Agents SDK。

## 本轮范围与证据等级

- 已使用用户指定的 OpenAI Developers 插件中 `agents` 技能，读取 Agents SDK 与 evals 参考；用 agent-reach 网页阅读路径取回官方 SDK、运行/状态与评测文档。
- 这不是 OpenAI 服务器自动给出的审计结论，也没有运行平台付费评测。插件提供开发指导；本报告结论来自当前代码、既有验收记录和本地诊断。
- 审查工作树 `/private/tmp/yizhi-jd-owner-release.0fO3IV`，HEAD `6c52df3fda495ea2913f72e2bff6fb7dde19a7f1`，本轮 `git ls-remote` 确认发布分支远端同 SHA。该 HEAD 的最新运行时提交为 `df89d92`。
- 正式部署与 Chrome 用户旅程状态引用仓库内已有的 10-13 验收记录；本轮没有重新签收生产环境、浏览器、余额或真实上游模型。
- 本轮未调用付费模型、未使用真实用户材料构造探针、未写生产数据库、未改旧作答/余额、未部署。断网重试按用户“再说吧”暂缓，仍未完成。
- 探针运行的是实际 `POST` 路由、实际计费包装器和实际编译器；身份、数据库和模型为明确的构造替身。模拟确认代码控制流，不证明真人已被重复扣费。

## 当前运行形态

主导师是“应用负责取料与约束 → 通常一次模型推理 → 确定性核验 → 保存”的有界流程；auto 档特定失败最多再尝试一个备用模型。没有让模型在任意 shell、浏览器或工具中自主反复规划执行。

| 层 | 真实位置与过程 | 当前判断 |
|---|---|---|
| 原始材料 | `coach_sources`、岗位 `metadata.resumeText`、`coach_opportunity_snapshots` | 原文与当前稿/快照分开保存，不应由摘要覆盖 |
| 用户事实 | `coach_claims`，保留来源、确认/撤回/冲突状态；查询限定 owner 与当前岗位/通用事实 | 基础较完整，普通辅导只取有界相关工作集 |
| 对话 | `coach_agent_turns`、`coach_learning_sessions` | 长期保存与会话恢复已存在；保存不是全部历史进入本轮模型的保证 |
| 人物摘要缓存 | `refreshProfileMemory` 读最近 120 条通用 claim → 抽取式压缩 → 按 owner + 来源指纹命中 `coach_memory_documents`，未命中才 insert | `profile/overview.md` 是数据库 path 标识，不是实体 sandbox 文件；正文最多约 5000 字符，状态与来源保留 |
| 学习记忆 | 当前岗位/通用 session 的非空 summary，按创建时间取最近 3 份 | 支持笔记/归档记忆，但没有按问题检索长期所有笔记或活跃会话旧原话的能力 |
| 知识库 | `knowledge-base/` Markdown → `data/knowledge-documents.generated.json` → 本地词面/任务/岗位排序 | 当前编译库 27 篇；主导师路径不是在线向量库。使用词面检索本身不是缺陷，需要效果集判定 |
| 上下文工作集 | `context.ts` 4000 estimated tokens；普通辅导相关事实最多 12 条/1400 tokens；整体 `materials.ts` 8000 estimated tokens | 有 required/optional 与取舍记录，但 optional 排除信息没有完整传给模型 |
| 私有记忆缓存 | 每轮重新编译原始事实，不共享私人回答 | owner 与岗位隔离有明确代码边界 |
| 公共缓存 | 岗位公开搜索 Next cache 30 分钟；公司研究公开材料 cache 24 小时，私人任务结果独立 | 共享的是公开结果，不是私人简历/对话；来源失败不当正常完整缓存 |
| 任务与恢复 | 搜岗/公司研究 `coach_runs`、events、step、幂等键、状态 CAS、过期任务 reconcile | 有台账和断后查询，不等于后台耐久执行/断点自动续跑 |
| 模型与输出 | 选路 → deadline → `callLLM` → NDJSON → 原文回指/不足信息守卫 → turn 保存 → quota finalize → done | 正确顺序大体存在，恢复与并发仍有缺口 |
| 产物 | outcomes 校验用户逐字原话，再由用户编辑/确认存笔记；简历采用/导出有单独链路 | 没把模型讲过当用户掌握，是应保留的产品边界 |
| Sandbox | 主导师无代码执行工具；未接 Agents SDK/API sandbox | 对目前受控求职辅导不是必须缺项。不要把支付 sandbox 或 iframe sandbox 当成计算沙箱 |

旧 `app/api/chat` 的 `user_memories`/自动摘要是另一条聊天链。它确实有代码，但不能拿来证明 `app/api/coach/agent` 的长期记忆已实现。

## 已确认问题与修复顺序

### H-01 / P0：已保存答案的同键恢复，先被额度层挡住

位置：`lib/metered-ai-route.ts:20–35`；`lib/quota.ts:36–45`；`app/api/coach/agent/route.ts:134–142,374–377`。

计费包装器先 reserve，才进入 `handlePost`。普通站点额度对使用过的幂等键返回拒绝；Watcha 的已存在 operation 也先返回 null。内层虽然写了“找到 turn 就返回原答案”，在这些分支却不可达。首轮赠送的专用 replay 是部分例外，不覆盖所有正常额度回答。

本地诊断：设置同 owner、同 session、同 request 已存在完整答案，并模拟使用过额度键，实际 POST 返回 **403 / 当前 AI 额度已用完**，没有返回已存答案、没有模型调用。

用户风险：响应丢失后点重试，恢复被误报额度不足。前端 `AgentConversation.tsx:160–163` 将 `ok:false` 当已结束失败并换新 requestId；若仍有可用额度，后续可能重新生成，违背“重试恢复原结果”。刷新后的 pending GET 可以识别已完成 turn，是另一条恢复出口，不能抵消这个重试缺陷。

建议：owner + requestId + 原输入绑定的只读恢复必须在新的预扣之前；返回 completed / processing / failed / not_found，已完成只返回原结果，进行中不再生成。只有明确没有已完成结果且失败已结清，才创建新 attempt。不能只把同键预扣放行，否则会放大 H-02。

验收：同键第一次已保存但响应丢失 → 额度为零仍能恢复同一个 turn；输入或 session 不一致 409；模型调用数不增加，余额不变化。

### H-02 / P0：TokenPay 同键并发，唯一约束发生得太晚

位置：`lib/quota.ts:31–32`；`app/api/coach/agent/route.ts:134,265,340`；数据库 `unique(user_id,request_id)`。

TokenPay reserve 分支直接返回凭证，没有抢占一次执行的持久化锁。两个并发请求都能在保存前读到不存在，各调用一次模型；turn 唯一约束只在模型执行之后拦第二次 insert。

本地诊断：相同 requestId 同时进入真实 POST/计费包装器，以构造的 TokenPay reservation 和模型替身执行，得到 **模型调用 2 次、响应 200 与 503、只保存 1 条 turn**。

用户风险：上游按模型用量计费，可能产生两次调用费用，而产品只呈现一条答案。本轮没有访问实际资金记录，不称已证明某个用户重复扣费。

建议：生成前持久化原子 claim/lease（唯一 owner + request），存输入指纹与 attempt 状态；并发第二请求只能读取/等待同任务，不调模型。进程内 Map 不足以覆盖多实例；额度幂等和结果幂等要绑定到同一请求状态。

验收：同键并发至少 10 请求、模拟跨实例，最多一个上游调用；唯一结果可回读；超时 lease 回收有规则，旧 worker 不能迟到覆盖新 attempt。

### H-03 / P1：“长期导师”有长期存储，但缺旧原话按需检索

位置：`app/api/coach/agent/route.ts:63,161,193–195`；`learning-memory.ts:49–63`。

history 默认读取最近 12 条；真正进入原始对话材料的是上一轮 + 前三轮，总共最多 4 轮，前三轮还受 1600-token 可选预算。教学 frame 会保留部分目标/完成标准，但不等于把全部历史事实和解释保留。学习摘要只取最近 3 份，检索 query 仅拼最近 2 次提问；没有对旧 turn 正文的相关性检索。

本地诊断：5 条历史中，第 5 个较早回答放唯一标记，模型实际输入没有该标记；近四轮仍可见。诊断条件明确无已存摘要；不将这个结果说成旧数据被删除或模型一定答错。

建议：保持近期窗口，但增加同 owner 的旧原话/笔记检索；持久保存用户明确的当前目标、限制、未完成问题、来源 turnId 和用户修改记录。用低成本抽取式更新先闭合，不默认每轮增加一次付费“记忆模型”。切岗可以衔接学习，事实证据仍按岗位隔离。

验收：20 轮后找回首轮限制、切岗不串 JD、改正过的事实优先、返回旧题能取原作答；对无法取回的内容明确说未知，不能补造。

### H-04 / P1：简历被预算排除，却没有把“已保存但本轮未读取”告诉模型

位置：`repository.ts:307`；`context.ts:267–300`；`prompt.ts:150–182`；`agent/route.ts:179`。

普通辅导的 resume attachment 是可选，JD 是必需。当前渲染器只输出 included，route 只取 `.text`；optional 被舍弃不会触发 required overflow，模型输入也没有这份简历的排除清单。

本地诊断：构造较长 JD 与已上传简历，4000-token 工作集把简历整份排除；`usage.truncated=false`，模型文字没有简历原文，也没有“简历已保存、本轮未装入”的说明。

这是上下文可见性缺口，不是建议粗暴提升所有预算。应先按任务检索简历完整段落/相关 claim；需要逐句审稿则走严格全量/分段方案。任何已保存未装入材料都应传 source inventory（存在/本轮可见/排除原因），必要时提示“本轮尚未读取”，不能说“你没上传”。

验收：长简历+长JD、普通教学和逐句编辑分别测试；预算排除可审计，模型不能把未读等同不存在，不增加用户重复上传。

### H-05 / P1：质量集存在，但内容验收与发布门没有闭合

位置：`evals/quality-pack.v1.ts:387–405`；`quality-pack.v1.test.ts:58–66`；`.github/workflows/harness-quality.yml:18–24`。

本轮相关 75 套/994 项回归通过，2 套与2项显式 live 检查跳过。质量集结果 **25 structural pass / 0 fail / 25 content missing**，semanticAcceptance=`not_evaluated`，publishable=`false`。

诚实记录 missing 是对的；问题是现有 Jest 明确断言内容仍 missing，CI 通过并不消费内容验收结果。八条 E2E 在该结构报告中固定 `not_run`；此前 Chrome 的已验学习/保存结果保存在单独文档，没有绑定到同一版本化质量矩阵。不能据此说“八条用户流程从未测过”，只能说“质量门没有归并这些证据”。

另一个关键覆盖缺口：`app/api/coach/agent/route.test.ts:14` 把计费包装器 mock 成直接调用 handler，而包装器测试也不接真实导师路由，所以 H-01/H-02 从两套各自绿的测试之间漏过去。本轮组合探针使用真实包装器才复现。

建议：分离单测门、内容门、真实浏览器签收，不冒充同一指标；将问题请求的完整路径写进集成测试；内容样本经人工 rubric 核验后形成不可覆盖基线，关联实际 provider/model、harness 指纹与 Chrome 证据。平台 trace grader 可以辅助，但不能替代真人内容评价。

验收：缺样本/缺证据不能显示已验；路由+计费+并发+持久化同测；少量模型 smoke 和人工校准另设显式权限/预算，避免每次 CI 隐性付费。

### H-06 / P1：任务可查询恢复，但不是耐久后台执行

位置：`jobs/discover/route.ts`、`research-runtime.ts`、`run-ledger/lifecycle.ts:591–631`。

主业务步骤仍在 HTTP handler 内执行，没有耐久 worker/队列；过期 reconcile 将未完成任务收口为失败/部分完成，不会自动继续此前步骤。NDJSON `cancel()` 只停止发送和记 interrupted，未把客户端断连变成统一的服务端取消状态。

这不代表用户离开页面一定丢结果；短任务可能继续完成。需要明确“断开观察”与“取消执行”两个不同动作，以及是否仍计费/保存。若产品承诺关页后继续，才引入最小的耐久任务执行；普通短答不必一律套多 Agent/沙箱/队列。

验收：关页仍完成的任务能回读；真正取消不接受迟到结果；平台硬超时不会留下无法结清的额度预留；回访能区分仍在执行、已失败和可续跑。

## 次级范围与不应误判的地方

- `subagents/retrieval.ts`、`resume.ts` 有契约与测试，但对应 `runRetrievalAgent/runResumeAgent` 没有在应用主路径中的调用点；搜索/改简历另有实现。不能按“有五个文件”宣称五 Agent 全接通，也不能据此说搜索/改简历完全没实现。
- 公司核验目录目前只有 Meshy/Kong 两条。未知公司诚实降级是正确的，但不能宣传广覆盖公司调研已接通；招聘岗位适配器是另一张覆盖表，不能混为同一指标。
- 知识正文有 `.slice(0,2600)` 的潜在静默裁剪，但当前 27 篇最长正文 1216 字符，本轮没有实际触发。记录为新增长文知识时的边界风险，不冒充当前生产故障。
- Profile 查询最近120条、事实查询300条、产物100条都未给出超限提示或完整分页；尚未证明当前账户触限。长期检索补齐时应覆盖规模上限。
- 失败请求主要留下 telemetry，成功 turn 才有完整编译 prompt/材料/guard trace。建议失败也留最小诊断 trace（原因、版本、存在与排除指针、调用状态），不要将用户材料散落到公开日志。
- 槽位挂载不能当作所有守卫都执行过：缺入参的守卫返回 `pass(input_absent)`。评测需检查适用时入参是否供齐，而不是只看 pass 数量。
- 私有 compiledPrompt 会从历史 API 剥离，这是正确边界；本轮未审查全部生产 RLS、日志权限或留存策略，不称已做全仓安全认证。

## 真实验收继承边界

10-13 Chrome 已验过独立 QA 第1题“不会 → 讲解 → 506字明示虚构重答 → 真实72分反馈保存 → 刷新回到同题”；简历排序保存/刷新也已验并修边界错误。本报告不把这些已完成项重报成未实现。

它们证明具体链路能成功，不证明 20轮记忆、TokenPay 并发、额度耗尽的已存答案恢复、完整三题整轮及所有模型长期稳定。当前断网保存重试仍待续验。

## 建议下一小版

1. 先完成 H-01/H-02 共用的 request 状态与免费恢复，再补组合集成测试。
2. 接旧原话/笔记检索和存在性清单，分别解决 H-03/H-04，不靠堆整段历史。
3. 以真实故障录入内容/恢复验收矩阵，将当前 Chrome 证据与部署指纹归并；明确后台任务语义。

本轮只审查与生成报告，没有实现这些建议、没有上线新修复。

## 可复验产物

- 诊断测试：`/tmp/yizhi-harness-audit.4RdCAY/harness-audit.test.ts`，4 项诊断全部复现；断言的是当前缺陷存在，不是4项修复通过。
- 回归机器结果：`/tmp/yizhi-harness-audit.4RdCAY/regression.json`，994 pass / 2 skipped / 0 fail。临时文件不保证长期保存，主要条件和结果已在本文保留。
- 既有真实验收：`docs/product/2026-10-13-interview-full-flow-acceptance.md`、`docs/product/2026-10-13-resume-live-save-acceptance.md`。

## 官方对照资料

- [OpenAI Developers — Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk)：运行时与存储由应用控制，不要求已有产品为了审查而迁移。
- [Running agents](https://developers.openai.com/api/docs/guides/agents/running-agents)：会话延续策略、流式结束与未完成状态恢复应明确区分。
- [Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals)：先以端到端 trace 调试，再用 datasets/graders/eval runs 做可重复质量检查。
