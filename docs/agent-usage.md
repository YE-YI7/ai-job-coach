# 益职 AI Agent 导航

益职让求职者在常用 Agent 里直接使用求职作战台。默认在本地读取和处理材料，不要求注册；只有用户主动选择同步时才连接线上服务。

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

安装命令会把 Skills 放入 `~/.workbuddy/skills/`，并在 `~/.workbuddy/mcp.json` 中合并一个本地“益职求职作战台”连接器。它只在本机保存事项状态和 Markdown 产物，不调用远程模型，也不会上传简历。重启 WorkBuddy 后生效。

### 其他支持 Agent Skills 的工具

```bash
curl -fsSL https://raw.githubusercontent.com/YE-YI7/ai-job-coach/backend/scripts/install-agent.sh | sh -s -- agents
```

安装脚本只下载本仓库 `backend` 分支中的 Skills，并写入对应的用户级 Skills 目录。如果已有同名 Skill，会先生成带时间戳的备份。

## 从这里开始

不需要先理解功能或选择 Skill。不确定下一步时直接说：

> 我正在找工作，但不知道从哪开始。

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

## 本地作战台

WorkBuddy 和 Codex 插件会得到四个可见工具：创建求职事项、打开当前作战台、更新阶段、保存交付物。默认数据位置是 `~/.yi-zhi/`，因此换一个对话仍可继续当前事项。

## 当前能力边界

- 分析和生成仍使用用户当前 Agent 的模型，不调用益职远程模型额度。
- 默认不把求职材料同步到 `ai-job-coach.xin`。
- 本地 MCP 只保存事项元数据与用户选择保存的成品；面试逐字稿不会默认保存。
- 线上历史、跨设备同步与账号体系仍需后续远程 MCP。
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
