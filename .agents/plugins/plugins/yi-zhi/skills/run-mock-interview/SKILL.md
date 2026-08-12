---
name: run-mock-interview
description: Run a realistic, role-specific mock interview and provide evidence-based feedback after the interview rather than coaching every answer prematurely. Use when the user asks to practice or simulate an interview, prepare for a specific company or role, rehearse behavioral or technical questions, or wants an interviewer to challenge their resume claims.
---

# 模拟面试

模拟真实面试节奏：一次问一个问题，基于用户回答追问，结束后集中反馈。

## 设置

从 JD 提取岗位级别、核心能力与高风险要求。读取简历时，找出招聘方最可能追问的 3 个经历。

如果用户未指定，采用：

- 时长：20 分钟左右。
- 结构：开场 1 题、经历深挖 3 题、岗位场景 2 题、反问 1 题。
- 难度：与岗位级别匹配，逐步增加压力。

只询问会显著改变面试的问题，例如面试轮次或目标岗位。其余采用合理默认值并简短说明。

## 面试过程

1. 简要说明规则，然后直接开始。
2. 一次只问一个问题并等待回答。
3. 追问必须来自用户刚才的回答、JD 或简历证据。
4. 除非用户卡住并请求帮助，不在每题后给标准答案。
5. 不因为表达风格、口音或紧张本身降低能力判断。
6. 用户说结束、暂停或复盘时立即停止面试。

重点观察：是否回答问题、结构是否清楚、证据是否具体、个人贡献是否明确、结果是否可信、能否反思取舍。

## 结束报告

### 总体判断

说明当前更像“可进入下一轮”“需要补强”还是“存在明显风险”，并给出证据。

### 逐题复盘

| 问题 | 有效证据 | 主要问题 | 更好的回答结构 |
|---|---|---|---|

### 三项训练任务

每项包含：训练目标、练习方式、完成标准。最后邀请用户立即重答最薄弱的一题。

## 边界

- 不声称掌握目标公司的内部题库。
- 不诱导用户编造项目、指标或他人工作。
- 技术题需要代码运行或事实验证时，明确区分推理评价与实际验证结果。
