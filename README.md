# 益职 AI - 你的求职 Agent

> 不只是给建议，而是把岗位、简历和面试变成有证据、可执行、可复盘的求职行动。

## 用你的 Agent 直接开始

Codex：

```bash
codex plugin marketplace add YE-YI7/ai-job-coach --ref backend && codex plugin add yi-zhi@yi-zhi
```

Claude Code：

```bash
curl -fsSL https://raw.githubusercontent.com/YE-YI7/ai-job-coach/backend/scripts/install-agent.sh | sh -s -- claude
```

WorkBuddy：

```bash
curl -fsSL https://raw.githubusercontent.com/YE-YI7/ai-job-coach/backend/scripts/install-agent.sh | sh -s -- workbuddy
```

重启 Agent 后直接说“我正在找工作，但不知道从哪开始”，或直接发送 JD、简历、面试记录。益职会把对方视为求职者，打开当前作战台并推进一个最值得做的动作，不要求用户先选择 Skill。完整能力、其他 Agent 安装方式和隐私边界见 [Agent 使用导航](docs/agent-usage.md)。

## Web 求职作战台

[ai-job-coach.xin](https://ai-job-coach.xin) 用于保存长期求职进度、面试复盘与训练任务。Agent Skills 第一版默认在本地处理材料，不会自动上传用户数据。

## 原项目说明

这是一个基于 Next.js 和 DeepSeek AI 的智能求职教练应用，帮助用户优化简历、准备面试、进行薪资谈判等求职相关任务。

## 功能特性

- 🤖 **AI 求职教练**：基于 DeepSeek 的智能对话，提供个性化职业建议
- 📄 **简历优化**：帮助用户优化简历内容，突出核心技能
- 🎯 **模拟面试**：提供面试准备和实战练习
- 💰 **薪资谈判**：提供薪资谈判策略和建议
- 📊 **进度跟踪**：可视化展示求职进度
- 🏆 **成就系统**：激励用户完成各项任务

## 技术栈

- **框架**：Next.js 16
- **UI**：Tailwind CSS 4
- **AI**：DeepSeek Chat API
- **语言**：TypeScript
- **部署**：Vercel

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/your-username/ai-job-coach.git
cd ai-job-coach
```

### 2. 安装依赖

```bash
npm install
# 或
yarn install
# 或
pnpm install
```

### 3. 配置环境变量

创建 `.env.local` 文件（本地开发）或 `.env` 文件（生产环境）：

```bash
cp .env.example .env.local
```

编辑 `.env.local`，添加您的 DeepSeek API Key：

```env
DEEPSEEK_API_KEY=your_deepseek_api_key_here
```

### 4. 获取 DeepSeek API Key

1. 访问 [DeepSeek 平台](https://platform.deepseek.com)
2. 注册/登录账号
3. 进入 [API Keys 页面](https://platform.deepseek.com/api_keys)
4. 创建新的 API Key
5. 复制并保存到 `.env.local` 文件中

### 5. 运行开发服务器

```bash
npm run dev
# 或
yarn dev
# 或
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看效果。

### 6. 构建生产版本

```bash
npm run build
npm start
```

## 部署到 Vercel

### 方法 1：通过 Vercel Dashboard

1. 将代码推送到 GitHub
2. 访问 [Vercel](https://vercel.com)
3. 点击 "New Project"
4. 选择您的 GitHub 仓库
5. 在 **Environment Variables** 中添加：
   - Key: `DEEPSEEK_API_KEY`
   - Value: 您的 DeepSeek API Key
6. 点击 "Deploy"

### 方法 2：使用 Vercel CLI

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署
vercel

# 添加环境变量
vercel env add DEEPSEEK_API_KEY

# 重新部署
vercel --prod
```

### ⚠️ 重要提示

**部署到 Vercel 时必须配置环境变量！**

如果没有配置 `DEEPSEEK_API_KEY` 环境变量：
- AI 对话功能将无法正常工作
- 会显示循环输出固定文案的错误
- 确保在 Vercel Dashboard 的 Environment Variables 中正确添加了 API Key

## 环境变量说明

| 变量名 | 说明 | 必需 | 获取地址 |
|--------|------|------|----------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | ✅ 是 | https://platform.deepseek.com/api_keys |

## 项目结构

```
ai-job-coach/
├── app/
│   ├── api/              # API 路由
│   │   ├── demo-chat/    # 对话 API
│   │   ├── interview/    # 面试 API
│   │   └── resume-optimize/ # 简历优化 API
│   ├── panels/           # UI 组件
│   ├── page.tsx          # 主页面
│   └── layout.tsx        # 布局
├── public/               # 静态资源
├── .env.example          # 环境变量示例
├── package.json          # 依赖配置
└── README.md             # 项目说明
```

## 开发指南

### 添加新功能

1. 在 `app/` 目录下创建新的页面或组件
2. 如需添加 API 路由，在 `app/api/` 下创建新的路由文件
3. 使用 Tailwind CSS 进行样式设计

### API 调用

所有 AI 相关的 API 调用都通过 DeepSeek API 实现，接口位于：
- `/api/demo-chat` - 主对话功能
- `/api/interview` - 面试相关
- `/api/resume-optimize` - 简历优化

## 故障排除

### 问题：AI 对话重复输出相同内容

**原因**：环境变量未配置或配置错误

**解决方案**：
1. 检查 `.env.local` 文件中是否有 `DEEPSEEK_API_KEY`
2. 如果是 Vercel 部署，检查 Dashboard 中的环境变量配置
3. 确认 API Key 是否有效

### 问题：构建失败

**解决方案**：
1. 确保所有依赖已安装
2. 检查 TypeScript 错误：`npm run lint`
3. 查看构建日志获取详细错误信息

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 联系方式

如有问题，请提交 Issue 或联系维护者。
