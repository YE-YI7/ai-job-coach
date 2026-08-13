> **历史规格，停止作为新版本实施依据。**
> 当前正式规格见 [`docs/product/agent-job-cockpit-v1-spec.md`](docs/product/agent-job-cockpit-v1-spec.md)。新版本以 Agent Plugin、远程 MCP、岗位机会和网页版求职作战盘为核心。

项目：AI Job Coach（单页对话流 MVP，历史版本）
目标：重构前端只保留 AI 主导对话页，右侧为智能白板。技术栈：Next.js (App Router) + TypeScript + Tailwind CSS + Framer Motion。后端接口统一走 /api/*，不要在前端暴露任何 API Key。所有组件独立、可复用、文件路径与命名需遵循项目约定（components/, app/, lib/）。每次实现只做一件事并返回：1) 新增/修改的文件路径；2) 关键代码片段（不全贴大文件）；3) 如何本地验证（命令与UI行为）。优先级：1 注册页+阶段选择 2 聊天主界面（信息结构与流式渲染） 3 右侧白板（占位与编辑） 4 FSM 状态与阶段切换 5 简历下探与面试下探页 6 动画与细节。保持代码简洁、注释到位、不要生成后端密钥或私密。每次输出不得超过 400 字。
