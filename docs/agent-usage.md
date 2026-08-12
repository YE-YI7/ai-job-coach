# 益职 AI Agent 导航

益职把求职教练能力交给用户自己的 Agent。第一版默认在本地读取和处理材料，不要求注册；只有用户主动选择同步时才连接线上作战台。

## 一行安装

### Codex 完整插件

```bash
codex plugin marketplace add YE-YI7/ai-job-coach --ref backend && codex plugin add yi-zhi@yi-zhi
```

安装后新开一个 Codex 任务，让新的 Skills 被加载。

### Claude Code

```bash
curl -fsSL https://raw.githubusercontent.com/YE-YI7/ai-job-coach/backend/scripts/install-agent.sh | sh -s -- claude
```

### WorkBuddy

```bash
curl -fsSL https://raw.githubusercontent.com/YE-YI7/ai-job-coach/backend/scripts/install-agent.sh | sh -s -- workbuddy
```

默认安装到用户级 `~/.workbuddy/skills/`，重启 WorkBuddy 后生效。首次导入第三方 Skill 时，WorkBuddy 可能先运行安全审查；本包只有 Markdown 工作流与元数据，不包含可执行脚本。

### 其他支持 Agent Skills 的工具

```bash
curl -fsSL https://raw.githubusercontent.com/YE-YI7/ai-job-coach/backend/scripts/install-agent.sh | sh -s -- agents
```

安装脚本只下载本仓库 `backend` 分支中的 Skills，并写入对应的用户级 Skills 目录。如果已有同名 Skill，会先生成带时间戳的备份。

## 从这里开始

不确定下一步时说：

> 帮我选择下一步最值得做的求职任务。

| 你现在要解决的问题 | 可以直接说 |
|---|---|
| 判断岗位是否值得投 | `分析这个 JD 和我的经历，找出关键匹配点与缺口` |
| 针对岗位改简历 | `根据这个 JD 定制我的简历，并展示所有修改差异` |
| 准备即将到来的面试 | `针对这个岗位开始一轮 20 分钟模拟面试` |
| 复盘一场真实面试 | `复盘这份面试记录，并生成下一轮训练计划` |

## 材料建议

- JD：粘贴全文或提供本地文本文件。
- 简历：优先提供可读取的 PDF、DOCX、Markdown 或纯文本文件。
- 面试复盘：可使用脱敏后的逐字稿、笔记或尽可能完整的回忆。
- 不要提交受保密协议约束的内容；手机号、邮箱、姓名和客户信息建议先脱敏。

## 当前能力边界

- 第一版依赖用户当前 Agent 的模型能力，不调用益职的远程模型额度。
- 默认不把求职材料同步到 `ai-job-coach.xin`。
- 线上历史、跨设备同步与用量计费将在远程 MCP 接入后提供。
- 益职提供求职准备和决策支持，不承诺录用结果。

## 产品结构

```text
益职导航
├── 岗位匹配诊断
├── 定制简历
├── 模拟面试
└── 面试复盘
    └── 弱项 → 训练任务 → 下一轮面试
```
