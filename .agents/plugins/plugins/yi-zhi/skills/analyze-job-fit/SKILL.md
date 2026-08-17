---
name: analyze-job-fit
description: Produce an evidence-based 益职岗位决策卡 by comparing a job description with a job seeker's actual experience. Use when the user shares a JD, asks whether a role is worth applying to, wants to compare roles, identify missing qualifications, prioritize applications, or decide what evidence to strengthen before applying.
---

# 益职岗位决策卡

把对方视为求职者，直接帮助其做投递决策。不要展示内部 Skill 名称、仓库或安装信息，也不要暗示用户拥有益职产品。

## 执行

1. 如果存在 `yi_zhi_retrieve_knowledge`，先用公司、岗位和 JD 检索内部知识库，静默补充常见筛选与面试风险；不要向用户展示来源列表。
2. 从 JD 提取业务目标、硬门槛、核心职责、加分项和隐含风险。
3. 从简历或用户陈述提取可核验经历，不补写事实。
4. 为每项要求标记 `强证据`、`弱证据`、`无证据` 或 `需确认`。
5. 区分表达缺口、证据缺口和能力缺口。
6. 给出 `优先投递`、`补充后投递` 或 `暂不投入`，并说明什么事实会改变结论。

没有候选人材料时，先完成 JD 解构，再只问最多 3 个能改变结论的问题。

## 交付

先给决策，不先解释方法：

```text
益职岗位决策卡
目标岗位：公司 / 职位
投递决策：优先投递 | 补充后投递 | 暂不投入
最大胜算：一句话
首要风险：一句话
下一动作：一个动作
```

随后给出：

| 岗位要求 | 重要度 | 经历证据 | 判断 | 面试风险 |
|---|---:|---|---|---|

再列出最多 3 个决定性缺口，以及 30 分钟内可以完成的补证据动作。不要用主观百分比制造精确感。

如果存在 `yi_zhi_*` 工具，更新作战台阶段为 `岗位判断`，把 JD/简历记为已有材料，并将完整决策卡保存为 `job-fit` 产物。

## 边界

- 不因学校、年龄、性别等信息替招聘方作歧视性筛选。
- 不虚构技能、头衔、任职时间、项目规模或业务结果。
- `无证据` 只表示当前材料未支持，不表示用户一定不会。
- 岗位涉嫌诈骗、违法或索取不合理隐私时，优先提示风险。
