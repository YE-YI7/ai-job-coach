# OpenCode 面试 Harness 执行记录

> 日期：2026-09-04
> 工作包：A — 后端真实面试 Harness
> 分支：`codex/agent-distribution`

## 改动摘要

### 1. `lib/interview/types.ts` — 新增类型

- 新增 `InterviewAssessment` 类型：符合工作包 A 合同，包含 `status`（assessed/needs_more_input）、`score`（null when needs_more_input）、`evidence`、`missingEvidence`、`dimensions`、`rewritePlan`、`followUp`。
- 新增 `InterviewRoundSummary` 类型：包含 `questionBreakdown`（每题决定性发现）和 `nextActions`（最多 3 个可执行下一步）。
- 新增 `InterviewRoundSummaryQuestion`、`InterviewRoundNextAction` 辅助类型。
- 更新 `AnswerQuestionResponse` 和 `InterviewSummaryResponse` 使用新类型。

### 2. `lib/interview/low-info-detector.ts` — 新增低信息回答检测器

- 可单测的纯函数 `detectLowInfoAnswer(answer)`：检测空回答、纯标点、占位词（不会/不知道/不清楚/...）、过短回答（<6字符）、重复字符（啊啊啊）、重复词组、末尾占位词。
- `buildNeedsMoreInputAssessment(reason)` 生成 `needs_more_input` 评估结果，含具体补充提示。

### 3. `lib/interview/llm.ts` — 重构 LLM 层

**删除的静默 stub 降级：**
- `generateInterviewQuestions` 不再 catch 错误后返回 `generateStubQuestions()`，而是向上抛出错误。
- `evaluateAnswer` 不再 catch 错误后返回 `generateStubEvaluation()`，而是向上抛出错误。
- `summarizeInterview` 不再 catch 错误后返回 `generateFallbackSummary()`，而是向上抛出错误。
- stub 模式（`LLM_STUB=1`）仅在显式启用时生效，用于测试和 demo。

**删除的随机分：**
- `generateFallbackSummary` 中维度分数不再使用 `Math.random()` 偏移，改为基于实际数据计算。
- `summarizeInterview` 的 dimensions fallback 不再使用随机数，改为使用总分 `base`。

**新增字段：**
- `evaluateAnswer` 返回 `InterviewAssessment` 格式（含 evidence、missingEvidence、rewritePlan、followUp）。
- `summarizeInterview` 接收 `questions` 参数，使用真实 `question_id` 和 `question_text` 生成 `questionBreakdown`；返回 `verdict`、`questionBreakdown`、`nextActions`。

### 4. `app/api/interview/answer/route.ts` — 重构单题 API

- 低信息回答拦截：在调用 LLM 之前检测，`needs_more_input` 时保存原回答但不评分。
- 评估结果必须符合 `InterviewAssessment` 合同。
- 保留幂等性（claim 机制）和 TokenDance recovery。

### 5. `app/api/interview/start/route.ts` — 存储 opportunityId

- session insert 新增 `opportunity_id` 字段，从请求体中读取并持久化。

### 6. `app/api/interview/complete/route.ts` — 重构整轮总结

- 读取 `session.opportunity_id`，优先使用请求体中的 `opportunityId`，fallback 到 session 中存储的。
- 读取题目、回答和评价，过滤掉 `needs_more_input` 的回答。
- 缺少真实回答（全部为低信息或无答案）时拒绝总结。
- 传递 `questions` 给 `summarizeInterview`，使 `questionBreakdown` 使用真实 question_id 和 question_text。
- 整轮结果写入当前岗位的 `interview_feedback` snapshot（幂等，`contentHash` 去重）。
- 生成 `questionBreakdown`（每题决定性发现）和 `nextActions`（可执行下一步）。
- **新增**：snapshot 写入后，将 `nextActions` 同步到 `coach_opportunities.metadata.actions`（去重追加，不阻塞主流程）。

### 6. `app/api/interview/summary/route.ts` — 更新 GET 总结

- 返回 `InterviewSummaryResponse` 格式，包含 `questionBreakdown` 和 `nextActions`。
- 过滤掉低信息回答后才生成总结。

## 测试覆盖

新增测试文件：

| 文件 | 测试数 | 覆盖场景 |
|---|---|---|
| `lib/interview/low-info-detector.test.ts` | 11 | 空回答、标点、占位词、过短、重复字符、重复词、末尾占位词、正常回答 |
| `app/api/interview/answer/route.test.ts` | 7 | 低信息拦截、正常评估、401 未认证、403 越权、409 重复、幂等重放、LLM 失败传播 |
| `app/api/interview/complete/route.test.ts` | 8 | 正常总结、全低信息拒绝、无答案拒绝、403 越权、409 重复、幂等重放、LLM 失败、snapshot 失败不阻塞 |

全部 29 个面试相关测试通过，`npx tsc --noEmit` 通过，`npm run build` 通过。

## 验证清单

- [x] 删除生产路径中的静默 stub 降级和随机分数（含 `generateInterviewQuestions`）
- [x] 建立可单测的低信息回答检测器
- [x] 问题绑定 JD/简历
- [x] 单题 API 符合 InterviewAssessment 合同
- [x] 低信息回答保存但不评分、不推进
- [x] 整轮总结读取题目+回答+评价，生成 questionBreakdown + nextActions（使用真实 question_id/text）
- [x] session 存储 opportunityId，complete 路由从中读取
- [x] 整轮结果写入 interview_feedback snapshot（幂等）
- [x] nextActions 同步到 opportunity metadata.actions
- [x] TokenDance recovery 保留
- [x] 未提交、未推送、未部署

## 未解决风险

1. **`interview_sessions.opportunity_id` 列**：新增了 `opportunity_id` 字段到 session insert，但需要 Supabase migration 添加该列。当前如果列不存在，insert 会失败。
2. **`CockpitApp.tsx` 类型冲突**：工作包 D（前端）修改了 `CockpitApp.tsx` 引入 `InterviewAssessmentView` 类型，与 `InterviewRoundtableAssessment` 不兼容。需要工作包 D 修复。
3. **LLM prompt 中 evidence 提取质量**：`evaluateAnswer` 的 prompt 要求 LLM 从回答中提取证据，但没有硬验证。如果 LLM 返回空 evidence，会自动降为 `needs_more_input`。
4. **snapshot 写入失败**：complete 路由中 snapshot 写入失败不阻塞响应，但日志中会有错误。
5. **actions sync 失败**：同步 nextActions 到 opportunity 失败不阻塞主流程，但需要监控。
6. **LLM 超时**：单题评估 30s 超时，整轮总结 30s 超时。在高并发或慢模型下可能需要调整。

## 主阵收口修正

- 已新增并上线 `interview_sessions.opportunity_id` 迁移，列为 nullable UUID，外键指向 `coach_opportunities`。
- 前端类型冲突已解决，完整 TypeScript 检查通过。
- snapshot 与 nextActions 写入现在是完成接口的硬门：写入失败返回失败并释放 claim，不再返回假成功。
- 题目不足不再补固定题，生产模型失败会显式失败；stub 仅允许 `LLM_STUB=1`。
- 主阵验证：32 个测试套件、262 个测试通过；生产构建通过；浏览器走通低信息停留、三题总结、免费单题反馈。
