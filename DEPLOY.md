# Railway 部署指南

本文档说明如何将 AI Job Coach 项目部署到 Railway。

## 📋 前置要求

- Railway 账户（[railway.app](https://railway.app)）
- GitHub 仓库（用于连接 Railway）
- 环境变量配置（API Keys）

## 🚀 部署步骤

### 1. 准备 GitHub 仓库

确保项目已推送到 GitHub：

```bash
git add .
git commit -m "Add Docker deployment configuration"
git push origin main
```

### 2. 在 Railway 创建新项目

1. 登录 [Railway Dashboard](https://railway.app/dashboard)
2. 点击 "New Project"
3. 选择 "Deploy from GitHub repo"
4. 选择你的仓库
5. Railway 会自动检测 `Dockerfile` 并开始构建

### 3. 配置环境变量

在 Railway Dashboard 中，进入项目设置，添加以下环境变量：

#### 必需的环境变量

```env
# LLM API Keys（至少配置一个）
DEEPSEEK_API_KEY=your_deepseek_api_key_here
# 或
OPENAI_API_KEY=your_openai_api_key_here

# Next.js 配置
NODE_ENV=production
PORT=3000
```

#### 可选的环境变量

```env
# Supabase（如果使用数据库）
SUPABASE_URL=your_supabase_url_here
SUPABASE_KEY=your_supabase_anon_key_here

# LLM 模型类型
LLM_MODEL_TYPE=deepseek
```

### 4. 首次部署和 FAISS Index 创建

首次部署时，FAISS 索引文件不存在，需要手动创建：

#### 方法 1：通过 API 调用创建（推荐）

部署完成后，访问你的 Railway 应用 URL，然后运行：

```bash
# 使用 curl 调用知识库摄入脚本（如果已实现）
curl -X POST https://your-app.railway.app/api/ingest
```

#### 方法 2：本地构建并上传

1. 本地运行知识库摄入：
   ```bash
   npm run ingest
   ```

2. 将生成的 FAISS 索引文件添加到项目：
   ```bash
   # 复制索引文件到项目根目录
   cp -r src/lib/knowledge/faiss-index ./faiss-index
   ```

3. 修改 Dockerfile 以包含索引文件（不推荐，因为文件较大）

#### 方法 3：运行时自动创建

项目会在首次使用时自动创建空的 FAISS 索引。索引文件将保存在容器的 `/app/faiss` 目录中。

**注意**：Railway 的容器是临时性的，重启后会丢失。建议使用持久化存储或外部数据库。

### 5. 验证部署

部署完成后，检查以下端点：

```bash
# 健康检查
curl https://your-app.railway.app/api/health
# 应返回: {"ok":true,"timestamp":"..."}

# 测试 Chat API
curl -X POST https://your-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}'

# 测试 Parse Resume API
curl -X POST https://your-app.railway.app/api/parse-resume \
  -F "file=@resume.pdf"
```

## 🐳 本地 Docker 构建和测试

在部署到 Railway 之前，可以在本地测试 Docker 镜像：

### 构建镜像

```bash
docker build -t jobcoach .
```

### 运行容器

```bash
# 设置环境变量
export DEEPSEEK_API_KEY=your_key_here

# 运行容器
docker run -p 3000:3000 \
  -e DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY \
  -e NODE_ENV=production \
  jobcoach
```

### 测试本地容器

```bash
# 健康检查
curl http://localhost:3000/api/health

# 测试 API
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "测试消息"}'
```

## 📊 查看日志

### Railway Dashboard

1. 进入项目 Dashboard
2. 点击 "Deployments" 标签
3. 选择最新的部署
4. 查看构建日志和运行时日志

### 命令行（Railway CLI）

```bash
# 安装 Railway CLI
npm i -g @railway/cli

# 登录
railway login

# 查看日志
railway logs
```

## 🔧 故障排查

### 构建失败

**问题**：`faiss-node` 编译失败

**解决方案**：
- 确保 Dockerfile 中安装了 `python3`, `make`, `g++`
- 检查 Node.js 版本是否为 20

**问题**：`npm install` 失败

**解决方案**：
- 检查 `package-lock.json` 是否存在
- 确保网络连接正常

### 运行时错误

**问题**：API 返回 500 错误

**解决方案**：
1. 检查环境变量是否配置正确
2. 查看 Railway 日志：`railway logs`
3. 确认所有 API 路由都设置了 `export const runtime = "nodejs"`

**问题**：FAISS 索引文件找不到

**解决方案**：
- 首次部署需要创建索引文件
- 检查 `/app/faiss` 目录是否存在
- 确保 `ensureDirectoryExists()` 方法正常工作

### 性能问题

**问题**：应用启动慢

**解决方案**：
- 检查构建日志，确保使用了 `--omit=dev`
- 考虑使用 Railway 的缓存功能
- 优化 Dockerfile 层缓存

## 🔐 安全建议

1. **不要提交敏感信息**：
   - 确保 `.env.local` 在 `.dockerignore` 中
   - 使用 Railway 的环境变量管理

2. **API Key 安全**：
   - 定期轮换 API Keys
   - 使用 Railway 的 Secret 管理功能

3. **依赖安全**：
   - 定期更新依赖：`npm audit fix`
   - 检查安全漏洞：`npm audit`

## 📝 生产环境检查清单

- [ ] 所有环境变量已配置
- [ ] 健康检查端点正常工作
- [ ] `/api/chat` 可以正常响应
- [ ] `/api/parse-resume` 可以正常解析文件
- [ ] FAISS 索引文件已创建（如果需要）
- [ ] 日志可以正常查看
- [ ] 应用可以正常重启
- [ ] 自定义域名已配置（可选）

## 🆘 获取帮助

如果遇到问题：

1. 查看 Railway 文档：https://docs.railway.app
2. 检查项目 Issues
3. 查看 Railway 社区：https://discord.gg/railway

## 📚 相关文件

- `Dockerfile` - Docker 构建配置
- `.dockerignore` - Docker 忽略文件
- `railway.json` - Railway 部署配置
- `next.config.ts` - Next.js 配置
- `.env.production.example` - 环境变量示例


