# 益职 AI Agent 导航

益职免费版让求职者在自己的 Agent 里使用同一套求职作战方法，并在当前 Agent 的本地沙箱中建立可视作战盘。益职不收取模型费；分析和生成使用用户现有 Agent 的套餐或额度。默认不注册益职账号，也不上传求职材料。

## 推荐入口：把一句话交给 Agent

用户无需自己判断宿主和执行命令。把下面这句话复制给拥有终端权限的 Agent：

> 请打开并完整阅读 https://ai-job-coach.xin/agent 。按页面的 Agent 执行说明，在你当前的沙箱环境中安装益职免费版，验证本地求职作战盘可以打开。完成后只告诉我安装结果，并问我第一个应该提供的求职材料。

读取说明的 Agent 应自行识别宿主、执行对应安装、接通 MCP，并在返回 `http://127.0.0.1:端口` 的可访问作战盘链接后才能宣布安装完成。

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

安装命令会把 Skills 放入 `~/.workbuddy/skills/`，把 MCP 服务放入 `~/.yi-zhi/mcp/server.mjs`，并在 `~/.workbuddy/mcp.json` 中合并一个本地“益职求职作战台”连接器。它只在本机保存事项状态和 Markdown 产物，不调用益职远程模型，也不会上传简历。重启 WorkBuddy 后生效。

### 其他支持 Agent Skills 的工具

```bash
curl -fsSL https://raw.githubusercontent.com/YE-YI7/ai-job-coach/backend/scripts/install-agent.sh | sh -s -- agents
```

安装脚本下载本仓库 `backend` 分支中的 Skills 与本地 MCP 服务。Skills 写入对应用户目录；MCP 服务统一写入 `~/.yi-zhi/mcp/server.mjs`。如果已有同名 Skill，会先生成带时间戳的备份。除 Codex 完整 Plugin 与 WorkBuddy 外，Agent 还需按自身宿主格式注册该 stdio MCP 服务。

## 版本更新

第一次安装会同时安装本地版本清单和 `yi_zhi_check_update` 工具。MCP 每次启动都会读取本地状态；只有距离上次联网检查达到一周时，才读取一次益职稳定版清单。检查不读取或上传简历、岗位与面试记录，也不会静默覆盖本地数据。

发现新版本后，Agent 会提醒一次。Codex 经用户确认后执行：

```bash
codex plugin marketplace upgrade yi-zhi && codex plugin add yi-zhi@yi-zhi
```

Claude Code、WorkBuddy 和通用 Agent 重新执行上方各自的安装命令。更新后重启或新建会话，并重新验证作战盘。

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

## 本地可视作战盘

完整接通 MCP 后，Agent 会得到八个可见工具：版本检查、知识检索、创建求职事项、规划今日任务、读取作战盘、打开浏览器、更新阶段和保存交付物。创建或继续一个岗位后，Agent 会返回一个只在本机可访问的作战盘链接；岗位、材料类型、当前行动和产物会在这里持续更新，不必在聊天里反复阅读长报告。

默认数据位置是 `~/.yi-zhi/`。本地页面随 Agent 连接启动，仅监听 `127.0.0.1`，不会公开到局域网或互联网。换一个对话仍可继续当前事项。

## 当前能力边界

- 分析和生成使用用户当前 Agent 的模型，不调用益职远程模型额度；Agent 宿主本身可能按套餐或用量计费。
- 默认不把求职材料同步到 `ai-job-coach.xin`。
- 本地 MCP 和可视作战盘只保存事项元数据与用户选择保存的成品；面试逐字稿不会默认保存。
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
