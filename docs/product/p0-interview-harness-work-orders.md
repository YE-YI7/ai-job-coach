# P0 面试 Harness 执行单

> 日期：2026-09-04
> 主分支：`backend`
> 当前工作分支：`codex/agent-distribution`
> 产品目标：面试题、单题反馈、整轮总结和下一步必须由同一份 JD、简历、用户真实回答驱动；不得用固定假反馈掩盖模型失败。

## 架构决策

1. **上下文真源**：`JD + 当前岗位简历 + 已确认经历 + 当前轮次 + 本轮问答 + 求职知识库`。
2. **低信息回答不评分**：如“不会”“不知道”“啊”等，返回 `needs_more_input`，说明缺什么并给一个容易回答的追问；保存原回答，但不推进到下一题。
3. **生产环境禁止静默 stub**：模型或 JSON 失败要明确报错并允许重试；固定模板只允许测试或显式 demo 使用。
4. **每条结论有依据**：反馈需区分“回答中出现的证据”“简历/JD 对照”“缺失或冲突”，不得生成用户未说过的经历和数字。
5. **结果必须沉淀**：逐题回答、逐题分析、整轮总结保存到当前岗位；整轮结束后生成最多 3 个可执行下一步并进入作战板。
6. **用户只看一个主动作**：同一时刻不展示互相竞争的 CTA。

## API 合同

### 单题评价

```ts
type InterviewAssessment = {
  status: "assessed" | "needs_more_input";
  score: number | null;
  summary: string;
  evidence: string[];
  missingEvidence: string[];
  dimensions: Array<{ name: string; score?: number; comment: string }>;
  rewritePlan: string[];
  followUp: string;
};
```

- `needs_more_input`：`score=null`，不得显示“基本可用”等评价，不推进题号。
- `assessed`：必须至少包含 1 条来自回答的 `evidence`；没有则降为 `needs_more_input`。

### 整轮总结

```ts
type InterviewRoundSummary = {
  overallScore: number;
  grade: string;
  verdict: string;
  strengths: string[];
  weaknesses: string[];
  dimensions: Array<{ name: string; score: number; comment: string }>;
  questionBreakdown: Array<{ questionId: string; score: number; decisiveFinding: string }>;
  nextActions: Array<{ title: string; reason: string; doneWhen: string; priority: "urgent" | "high" | "normal" }>;
};
```

## 工作包 A — OpenCode：后端真实 Harness

只修改：

- `lib/interview/**`
- `app/api/interview/start/**`
- `app/api/interview/answer/**`
- `app/api/interview/complete/**`
- `app/api/interview/summary/**`
- `app/api/coach/interview-practice/**`
- 对应测试；确需扩展类型时可修改 `lib/opportunities/types.ts`

要求：

1. 删除生产路径中的静默 stub 降级和随机分数。
2. 建立可单测的低信息回答检测器；中文短回答、占位词、重复字符和无事实回答必须拦截。
3. 问题必须带 `JD/简历` 对应依据；模型失败时不混入固定通用题。
4. 单题 API 符合上面的合同，保存低信息回答，但不伪造评价。
5. 整轮总结读取题目、回答和评价，生成 `questionBreakdown + nextActions`；缺少真实回答时拒绝总结。
6. 整轮结果写入当前岗位的 `interview_feedback` snapshot，并把下一步同步进岗位 action；必须幂等。
7. TokenDance 恢复响应不得被吞掉。
8. 增加失败、越权、重复请求、低信息回答、模型失败、正常闭环测试。

完成标准：相关测试、`npx tsc --noEmit`、`npm run build` 通过；不提交、不推送、不部署；写 `docs/agent-runs/opencode-interview-harness.md` 说明改动、测试和未解决风险。

## 工作包 B — Grok Bot：红队验收设计

只读代码，不修改产品源文件。输出 `docs/agent-runs/grok-interview-redteam.md`：

- 20 个会击穿当前面试功能的输入案例；至少覆盖两字回答、复制 JD、简历冲突、模型超时、重复提交、跨岗位串线、越权读取。
- 每个案例写：输入、预期行为、当前风险、验收证据。
- 明确找出任何仍可能出现“假装 AI 成功”的路径。

## 工作包 C — 豆包工作：导师反馈标准

只读 PRD 和现有知识库，不改产品源文件。输出 `docs/agent-runs/doubao-interview-rubric.md`：

- 业务面、项目深挖、HR 面三类的题目生成规则。
- 单题反馈必须引用哪些真实证据，何时拒绝评分。
- 整轮总结的 7 个评价维度及可观察标准。
- 10 组“差反馈 → 合格导师反馈”对照；禁止补写经历。

## 工作包 D — WorkBuddy：前端闭环

**等待工作包 A 完成后再执行。** 只修改：

- `components/cockpit/CockpitApp.tsx`
- `components/cockpit/CockpitApp.module.css`
- 必需的前端测试

要求：

1. `needs_more_input` 时显示“信息不足，暂不评分”，给具体补充提示，停留当前题。
2. `assessed` 时显示证据、缺口、重答提纲和追问；下一题是唯一主按钮。
3. 整轮结束展示完整总结、逐题决定性问题和最多 3 个下一步；返回作战板后可看到这些任务。
4. 与现有米白/黑/橙基调一致，减少按钮和装饰，不另做聊天页。
5. 真实错误明确展示并允许重试；禁止把失败显示成成功。

完成标准：相关测试、TypeScript、build 通过；本地浏览器完成一次低信息回答和一次正常回答；不提交、不推送、不部署；写 `docs/agent-runs/workbuddy-interview-ui.md`。

## 主阵验收

1. 审查四份产出和工作树差异。
2. 跑完整测试、类型检查、构建。
3. 用真实 JD + 简历走：低信息拒评 → 正常单题 → 三题整轮 → 总结 → 作战板下一步。
4. 只在真实线上流程可复现后提交、推送和部署。
