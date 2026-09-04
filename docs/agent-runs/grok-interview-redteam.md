# 工作包 B · 面试红队验收（Grok Bot）

- **仓库：** `ai-job-coach`（只读产品源码；本文件为验收产出）
- **日期：** 2026-09-04
- **依据：** `docs/product/p0-interview-harness-work-orders.md` 工作包 B；架构期望：低信息 → `needs_more_input`；生产禁止静默 stub；不得用固定假反馈掩盖模型失败
- **约束：** 不改产品源文件；不提交 / push / 部署

---

## 一、仍可能「假装 AI 成功」的路径（全量）

| ID | 路径 | 机制 | 用户可见后果 |
|----|------|------|----------------|
| F1 | `lib/interview/llm.ts` → `evaluateAnswer` catch | 超时/抛错 → `generateStubEvaluation()`：固定 score≈60 + 套话 | HTTP 仍可能 200；像「评过了」 |
| F2 | 同上 → `generateInterviewQuestions` catch | 失败 → `generateStubQuestions` | 题面像真题，实为模板 |
| F3 | 同上 → 题目数量不足 | LLM 返回题数 < count → **pad stub 题** | 混真假题，无告警 |
| F4 | 同上 → `summarizeInterview` | assessments 空 / catch → stub 或 `generateFallbackSummary`；维度用 **`Math.random()`** 填 | 总结「像那么回事」 |
| F5 | `LLM_STUB=1` | 强制全 stub | 环境级假装成功（应仅测/演示） |
| F6 | `app/api/interview/route.ts` | 无 `DEEPSEEK_API_KEY` → `isStubMode`；各 action catch → stub* | 旧 API 整链假成功；`debug.mode:"stub"` 易被前端忽略 |
| F7 | `stubAnswer` 启发式 | 长度/关键词打分 + exemplar | 无模型也「有分数」 |
| F8 | Cockpit `dataMode==="demo"` | 本地假圆桌 / 固定 68 分 / 450ms 假反馈 | Demo 可接受；若误当 live 则骗 |
| F9 | `/api/interview/start` + F2 | 出题 stub 后仍可能 **quota 记成功** | 扣额度/记成功但非真模型 |
| F10 | `lib/interview/practice.ts` | verdict/文案软默认填充 | 轻假成功；不完整会 throw（相对可控） |
| F11 | 超时阈值 | 出题 60s / 评价·总结 30s / practice 35s / legacy 30s → 落入 F1–F4/F6 | 「慢一下」变「假评价」而非硬失败 |
| F12 | 前端未区分 stub 标记 | 若 API 不把 `mode:stub` 打到主 UI | 用户无法分辨真假 AI |

**红队结论：** 生产路径上 **F1–F4、F9、F11** 是最高危「假装成功」；与工作订单 Arch #3（生产禁止静默 stub）直接冲突。验收必须以「失败可见、不推进、不记成功额度」为准，而非 HTTP 200。

---

## 二、20 个击穿案例

### Case 01 — 两字回答（低信息）
- **输入：** 面试作答提交正文为 `还行`（或 `嗯` / `不知道`）。
- **预期行为：** `InterviewAssessment.assessed === false` 或 status=`needs_more_input`；**无分数**；不进入下一题；提示需补充证据/经历。
- **当前风险：** `evaluateAnswer` 若走通可能给分；若超时/失败落入 **F1 stub 60 分**，低信息被当成「基本可用」。
- **验收证据：** 响应体无 score 或明确 `needs_more_input`；UI 不展示维度分；题号不递增；无 stub 套话。

### Case 02 — 单字/空白/纯标点
- **输入：** ` `（空）、`。`、`…`、零宽字符。
- **预期行为：** 同 Case 01；校验层应拒收或 `needs_more_input`。
- **当前风险：** 长度启发式（F7）或 stub（F1）给出非零分；空白被 trim 后仍进模型浪费额度。
- **验收证据：** 4xx 或 `needs_more_input`；quota 不因无效作答记「评价成功」。

### Case 03 — 复制整段 JD 当回答
- **输入：** 将当前岗位 JD「岗位要求」全文粘贴为答案。
- **预期行为：** 判定为未回答问题（跑题/复制材料）；`needs_more_input` 或明确「请用自己的经历作答」；**不高分**。
- **当前风险：** 关键词命中 JD（Agent/MCP/平台）触发 F7 高分或真模型「看似相关」高分；无简历锚点校验。
- **验收证据：** 低分或拒绝推进；反馈点名「复制 JD」类问题；不进入下一题除非用户重答。

### Case 04 — 复制简历 bullet 但与问题无关
- **输入：** 问题问「跨团队推动」，回答整段粘贴 CrabRes token -49% 技术细节，无协作内容。
- **预期行为：** 有内容但未答所问 → 低分或 `needs_more_input` 要求对齐问题；`questionBreakdown` 标明答非所问。
- **当前风险：** 长文本 + 数字被当成优质答案；stub/真模型给虚高分。
- **验收证据：** 反馈明确「未回答本题」；分数显著低于「切题+有证据」金样例。

### Case 05 — 简历冲突（经历造假）
- **输入：** 用户画像/机会证据仅有「好未来实习」；回答声称「我在腾讯带 200 人 Agent 平台三年」。
- **预期行为：** 对照机会内证据/基础简历；冲突 → 降权或要求澄清；不得当强证据写进 summary。
- **当前风险：** 评价链路未强制绑定 opportunity 证据库；冲突句仍高分并进入 round summary。
- **验收证据：** 评估引用证据 ID/原文；冲突有标记；总结不把假经历写成事实。

### Case 06 — 简历冲突（量化指标矛盾）
- **输入：** 简历写周活约 10；回答写「周活 10 万」。
- **预期行为：** 数字不一致 → 质疑或 `needs_more_input`；禁止两边都当事实写入。
- **当前风险：** 无数字一致性门；summary 随机/平均后变成「数据驱动」假叙事（F4）。
- **验收证据：** 指出不一致；总结不出现未经确认的「10 万」。

### Case 07 — 模型超时（评价）
- **输入：** 正常长度切题回答；注入/模拟 `evaluateAnswer` >30s 超时或上游 504。
- **预期行为：** **硬失败**可见（错误态/可重试）；不给假分；不推进；不静默 stub。
- **当前风险：** **F1 + F11**：超时 → stub 60 分套话，用户以为 AI 已评。
- **验收证据：** UI/API 明示模型失败或超时；body 含 error/failed 而非 assessed+score；无「回答基本可用，但缺乏亮点」。

### Case 08 — 模型超时（出题）
- **输入：** `/api/interview/start` 时 LLM 超时。
- **预期行为：** 启动失败；不进入「进行中」；quota 不记成功（或回滚）。
- **当前风险：** **F2 + F9**：stub 题 + 额度记成功。
- **验收证据：** 无题组或明确 demo/stub 旗标且不可用于正式轮；quota 事件 ≠ success。

### Case 09 — 模型超时（总结）
- **输入：** 完成一轮后 `/summary` 超时。
- **预期行为：** 总结失败可重试；不展示随机维度分。
- **当前风险：** **F4**：fallback/random 维度装成完整报告。
- **验收证据：** 无 `Math.random` 痕迹的稳定失败态；重试后一致。

### Case 10 — 重复提交同一 answer
- **输入：** 同一 `questionId`/轮次对 `/api/interview/answer` 连点两次相同 body。
- **预期行为：** 幂等：第二次 409 或 replay 同结果；不双计分、不双扣费、不跳两题。
- **当前风险：** 双调用双评；或一次真一次 stub；`interview-generation-claims` 若未覆盖 answer 则漏防。
- **验收证据：** 二次响应与 claim/idempotency 文档一致；题序 +1 而非 +2；ledger 单次。

### Case 11 — 重复 start 同一机会
- **输入：** 机会已有进行中的 mock round，再次 `start`。
- **预期行为：** 拒绝或恢复已有轮次；不平行两套题。
- **当前风险：** 两套 session 串题；quota 双扣。
- **验收证据：** 单 active round；明确错误码。

### Case 12 — 跨岗位串线（答 A 岗题写进 B 岗）
- **输入：** Session/token 属于机会 A；请求 body 带 `opportunityId=B` 或切换岗后仍用 A 的 `roundId` 提交。
- **预期行为：** 校验 round∈opportunity∈user；否则 403/404。
- **当前风险：** 若只信客户端 opportunityId，评价写入错误机会；coach next-action 串线。
- **验收证据：** 越权或错绑返回错误；B 岗动态无 A 的答案。

### Case 13 — 跨岗位串线（总结读错岗）
- **输入：** 完成 A 轮后，用 A 的 assessments 请求但 query 指向 B。
- **预期行为：** 拒绝交叉；总结仅含 A。
- **当前风险：** summary 不校验 ownership → B 概览出现 A 的面试结论。
- **验收证据：** 数据隔离测试：两岗 fixture，交叉调用失败。

### Case 14 — 越权读取他人 round
- **输入：** 登录用户 U1，请求 U2 的 `roundId`/`summary`/`assess`（枚举或泄露 ID）。
- **预期行为：** 403/404；无题目、答案、分数泄漏。
- **当前风险：** 若 API 仅按 ID 取库不校 `user_id`，则 IDOR。
- **验收证据：** 双用户集成测；响应无 U2 文本。

### Case 15 — 越权读取机会面试材料
- **输入：** U1 调用 coach/interview 相关接口附带 U2 `opportunityId`。
- **预期行为：** 同 Case 14。
- **当前风险：** harness/next-action 若按 opportunity 主键无 authz 则泄漏 JD/证据。
- **验收证据：** authz 单测 + 手工 IDOR。

### Case 16 — 低信息但夹带关键词刷分（启发式击穿）
- **输入：** `还行，我用过 Agent 和 MCP。`（无经历细节）。
- **预期行为：** 仍 `needs_more_input`（信息不足）。
- **当前风险：** F7 关键词加分；真模型给「沾边」分；绕过两字门但无证据。
- **验收证据：** 需具体项目/结果才 `assessed`；关键词 alone 不够。

### Case 17 — 显式 stub 环境误入生产配置
- **输入：** 生产/预发误设 `LLM_STUB=1` 或清掉 `DEEPSEEK_API_KEY` 走 legacy 路由。
- **预期行为：** 启动自检失败或 UI 大横幅「演示模式」；禁止记正式进度。
- **当前风险：** F5/F6 静默假成功，与 Arch #3 冲突。
- **验收证据：** 环境探针；正式 cockpit 拒绝无密钥+非 demo。

### Case 18 — Demo 模式与 Live 混淆
- **输入：** `dataMode=demo` 下完成一轮，再切 live 期望保留分数。
- **预期行为：** Demo 数据不可升格为正式资产；切换有提示。
- **当前风险：** F8 假 68 分被用户当成真实评估。
- **验收证据：** Demo 水印；动态/机会写入隔离。

### Case 19 — 题目 pad 导致「假后半程」
- **输入：** 模型只返回 1 题但 UI 请求 5 题（触发 F3 pad）。
- **预期行为：** 失败或让用户重试；禁止静默补模板题。
- **当前风险：** 用户答到第 2 题起打的是 stub 题，仍以为全链路 AI。
- **验收证据：** 返回题数不足则 error；日志无 pad；或每题标 `source:llm|stub` 且 stub 不可用于正式轮。

### Case 20 — 完整一轮「失败被总结成成功」
- **输入：** 5 题中 3 次评价超时（F1）、2 次低信息；最后调用 complete/summary。
- **预期行为：** 总结标明未评估题；overall 不得用假平均装完成；`nextActions` 含「重答未评估题」。
- **当前风险：** F4 把空洞 assessments 填成完整雷达图；产品叙事「本轮已完成」。
- **验收证据：** `questionBreakdown` 含 failed/needs_more_input；无全绿假报告；与 Arch #2/#3 一致。

---

## 三、建议验收顺序（执行侧）

1. 单测/集成：强制 mock LLM throw → 断言 **无** stub score（反例锁 F1–F4）。
2. 契约测：两字 / 空 / 复制 JD → `needs_more_input`。
3. 幂等：双提交 answer/start。
4. Authz：双用户 IDOR。
5. 配置：生产拒绝 `LLM_STUB` / 无 key 走正式 UI。
6. 前端：stub/demo 必须可见标记。

---

## 四、工作包 B 完成状态

- [x] 20 案例（含：两字、复制 JD、简历冲突×2、超时×3、重复提交×2、跨岗串线×2、越权×2，及关键词刷分/stub 配置/demo/pad/总结造假）
- [x] 每案例四字段：输入、预期行为、当前风险、验收证据
- [x] 「假装 AI 成功」路径表 F1–F12
- [x] 未修改产品源文件；未 git 提交 / push / 部署
