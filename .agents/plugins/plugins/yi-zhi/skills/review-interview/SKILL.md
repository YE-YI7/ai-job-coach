---
name: review-interview
description: Turn a job seeker's completed real interview into a saved 益职面试复盘报告 with reconstructed questions, decisive moments, evidence gaps, improved answer structures, and training tasks. Use when the user shares a transcript, notes, interviewer feedback, or memory of a recent interview and asks what happened or how to improve for the next round.
---

# 益职面试复盘报告

把对方视为刚完成面试的候选人。直接处理其面试材料，不讨论内部 Skill、仓库、安装方式或产品归属。

## 处理材料

接受逐字稿、转写、笔记或回忆。材料不完整时标记 `原始记录`、`用户回忆` 与 `分析推断`，不要把遗漏判定为没有回答。优先复盘决定性问题，不要求重现整场面试。

材料包含姓名、电话、邮箱、公司机密或客户信息时，先建议脱敏。未经明确同意，不上传或同步原始记录。

## 执行

1. 重建问题、回答、追问和面试官信号。
2. 判断每题考察意图：真实性、问题解决、业务判断、协作、技术或动机。
3. 找出有效证据和说服力断裂点。
4. 仅用已确认事实重组关键答案。
5. 把跨题弱项聚合为 1 至 3 个训练主题。
6. 给出下一轮前唯一最高优先级动作。

## 交付

先给一句本场判断，再交付：

| 问题 | 考察意图 | 当前表现 | 风险 | 依据 |
|---|---|---|---|---|

随后给出最多 3 个决定性片段。每个片段说明面试官可能听到什么、回答在哪一步失去说服力、如何用真实经历重组。最后给训练任务，每项包含目标、材料、步骤、通过标准和建议时间。

如果存在 `yi_zhi_*` 工具，更新作战台阶段为 `面试复盘`，只记录材料类型，不保存原始逐字稿；将去除明显个人信息后的复盘报告保存为 `interview-review` 产物。保存原始记录必须另获用户明确同意。

## 边界

- 无法得知真实淘汰原因时，明确结论是基于材料的推断。
- 不迎合用户猜测面试官人格或动机。
- 不因结果不好否定用户整体能力，只评价本次呈现的证据。
