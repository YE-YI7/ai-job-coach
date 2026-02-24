# Railway 部署指南

<cite>
**本文档引用文件**  
- [DEPLOY.md](file://DEPLOY.md)
- [railway.json](file://railway.json)
- [.dockerignore](file://.dockerignore)
- [package.json](file://package.json)
- [.env.example](file://.env.example)
- [scripts/ingest.ts](file://scripts/ingest.ts)
- [src/lib/vectorstore/hnswlib.ts](file://src/lib/vectorstore/hnswlib.ts)
- [src/lib/rag/loader.ts](file://src/lib/rag/loader.ts)
- [src/lib/embeddings/base.ts](file://src/lib/embeddings/base.ts)
</cite>

## 目录

1. [项目结构](#项目结构)  
2. [部署流程](#部署流程)  
3. [railway.json 配置详解](#railwayjson-配置详解)  
4. [Docker 构建与优化](#docker-构建与优化)  
5. [环境变量配置](#环境变量配置)  
6. [FAISS 索引创建与持久化](#faiss-索引创建与持久化)  
7. [部署验证](#部署验证)  
8. [常见问题与解决方案](#常见问题与解决方案)  
9. [附录：知识库摄入脚本](#附录知识库摄入脚本)

## 项目结构

本项目为基于 Next.js 的全栈 AI 求职教练应用，核心结构如下：

- `app/`：Next.js App Router 路由结构，包含 API 接口与页面
- `components/`：React 组件库
- `lib/`：核心逻辑库，包括 LLM 调用、状态机、向量存储等
- `src/lib/knowledge/`：本地知识库文档（Markdown 格式）
- `scripts/ingest.ts`：知识库向量化脚本
- `railway.json`：Railway 部署配置
- `Dockerfile`：容器构建定义（未在文件列表中，但由 DEPLOY.md 引用）
- `.dockerignore`：Docker 构建上下文排除规则

**Section sources**  
- [DEPLOY.md](file://DEPLOY.md#L1-L264)
- [project_structure](file://project_structure)

## 部署流程

### 1. 准备 GitHub 仓库

确保项目已推送至 GitHub 仓库：

```bash
git add .
git commit -m "部署配置"
git push origin main
```

### 2. 在 Railway 创建项目

1. 登录 [Railway 控制台](https://railway.app/dashboard)  
2. 点击 "New Project"  
3. 选择 "Deploy from GitHub repo"  
4. 关联您的 GitHub 仓库  
5. Railway 将自动检测 `Dockerfile` 并启动构建流程

### 3. 配置环境变量

在 Railway 项目设置中添加以下环境变量：

#### 必需变量

```env
# LLM API 密钥（至少配置一个）
DEEPSEEK_API_KEY=your_key_here
# 或
OPENAI_API_KEY=your_key_here

# Node.js 环境
NODE_ENV=production
PORT=3000
```

#### 可选变量

```env
# Supabase 数据库
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key

# 指定 LLM 模型类型
LLM_MODEL_TYPE=deepseek
```

**Section sources**  
- [DEPLOY.md](file://DEPLOY.md#L31-L57)
- [.env.example](file://.env.example#L1-L11)

## railway.json 配置详解

`railway.json` 是 Railway 的部署配置文件，定义了构建与运行行为。

```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "numReplicas": 1,
    "startCommand": "npm start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 10000,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### 字段说明

- **build.builder**：指定构建方式为 `DOCKERFILE`，即使用 Docker 构建  
- **build.dockerfilePath**：Dockerfile 路径，此处为项目根目录下的 `Dockerfile`  
- **deploy.startCommand**：容器启动命令，执行 `npm start`，对应 `package.json` 中的 `"start": "next start"`  
- **deploy.healthcheckPath**：健康检查路径，Railway 定期访问 `/api/health` 确认服务存活  
- **deploy.numReplicas**：部署副本数，设为 1 表示单实例  
- **restartPolicy**：失败重启策略，最多重试 10 次

**Section sources**  
- [railway.json](file://railway.json#L1-L30)
- [package.json](file://package.json#L5-L9)
- [DEPLOY.md](file://DEPLOY.md#L44-L45)

## Docker 构建与优化

### .dockerignore 文件

`.dockerignore` 用于排除不必要的文件进入构建上下文，提升构建效率与安全性。

```plaintext
node_modules
.next/cache
.git
.env.local
.env*.local
.DS_Store
*.log
.vscode
.idea
coverage
dist
build
```

该配置确保：
- 本地依赖不被包含，由 `Dockerfile` 重新安装
- 开发环境配置（如 `.env.local`）不会泄露
- 缓存与构建产物不被复制，避免冲突

### Docker 构建流程

1. 基于 Node.js 20 镜像构建  
2. 复制 `package.json` 和 `package-lock.json`  
3. 执行 `npm install --omit=dev` 安装生产依赖  
4. 复制源码并构建 Next.js 应用  
5. 暴露 3000 端口，启动服务

**Section sources**  
- [.dockerignore](file://.dockerignore#L1-L27)
- [DEPLOY.md](file://DEPLOY.md#L116-L132)

## 环境变量配置

### 必需环境变量

| 变量名 | 说明 |
|-------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥，用于 LLM 调用 |
| `NODE_ENV` | 必须设为 `production` 以启用生产模式 |

### 可选环境变量

| 变量名 | 说明 |
|-------|------|
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_KEY` | Supabase 匿名密钥 |
| `LLM_MODEL_TYPE` | 指定使用的 LLM 类型（如 `deepseek`） |

**注意**：所有敏感信息应通过 Railway 的 Secret 管理功能配置，避免硬编码。

**Section sources**  
- [DEPLOY.md](file://DEPLOY.md#L35-L57)
- [.env.example](file://.env.example#L1-L11)

## FAISS 索引创建与持久化

FAISS（或本项目使用的 HNSWLib）向量索引用于存储知识库的嵌入向量，首次部署需手动创建。

### 三种创建方式

#### 方法一：通过 API 调用创建（推荐）

部署完成后，调用知识库摄入 API：

```bash
curl -X POST https://your-app.railway.app/api/ingest
```

> **注意**：此 API 需在代码中实现，当前项目可能未暴露此端点。

#### 方法二：本地构建并上传

1. 本地运行摄入脚本：
   ```bash
   npm run ingest
   ```
2. 将生成的 `hnswlib-index` 目录复制到项目中
3. 提交并推送，触发重新部署

#### 方法三：运行时自动创建

项目启动时，若检测到索引不存在，会自动创建空索引。但存在以下挑战：

- **持久化问题**：Railway 容器为临时性，重启后索引丢失
- **冷启动延迟**：首次使用需重新生成索引，影响性能

### 持久化建议

- 使用外部向量数据库（如 Pinecone、Weaviate）
- 配置 Railway 持久化存储卷
- 预先构建索引并打包进镜像（不推荐，镜像过大）

**Section sources**  
- [DEPLOY.md](file://DEPLOY.md#L59-L91)
- [scripts/ingest.ts](file://scripts/ingest.ts#L1-L77)
- [src/lib/vectorstore/hnswlib.ts](file://src/lib/vectorstore/hnswlib.ts#L65-L67)

## 部署验证

部署完成后，执行以下验证：

### 健康检查

```bash
curl https://your-app.railway.app/api/health
# 预期响应: {"ok":true,"timestamp":"..."}
```

### API 功能测试

```bash
# 测试聊天功能
curl -X POST https://your-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}'

# 测试简历解析
curl -X POST https://your-app.railway.app/api/parse-resume \
  -F "file=@resume.pdf"
```

**Section sources**  
- [DEPLOY.md](file://DEPLOY.md#L93-L110)
- [app/api/health/route.ts](file://app/api/health/route.ts)

## 常见问题与解决方案

### 构建失败

- **问题**：`faiss-node` 编译失败  
  **解决方案**：确保 `Dockerfile` 安装了 `python3`, `make`, `g++`，并使用 Node.js 20

- **问题**：`npm install` 失败  
  **解决方案**：检查 `package-lock.json` 是否存在，确保网络正常

### 运行时错误

- **问题**：API 返回 500 错误  
  **解决方案**：检查环境变量、查看日志、确认 API 路由设置了 `export const runtime = "nodejs"`

- **问题**：FAISS 索引文件找不到  
  **解决方案**：首次部署需手动创建索引，检查 `/app/hnswlib` 目录权限

### 性能问题

- **问题**：应用启动慢  
  **解决方案**：使用 `--omit=dev` 减少依赖，优化 Docker 层缓存

**Section sources**  
- [DEPLOY.md](file://DEPLOY.md#L169-L208)

## 附录：知识库摄入脚本

`scripts/ingest.ts` 负责将 `src/lib/knowledge/` 下的文档加载、切分、嵌入并保存为向量索引。

### 执行流程

1. 读取 `.md`, `.txt`, `.pdf`, `.docx` 文件
2. 使用 `RecursiveCharacterTextSplitter` 切分为 500 字符的块
3. 调用嵌入模型生成向量
4. 保存至 `hnswlib-index` 目录

### 运行命令

```bash
npx ts-node scripts/ingest.ts
```

**注意**：该脚本依赖已移除的 LangChain，仅用于本地预处理。

**Section sources**  
- [scripts/ingest.ts](file://scripts/ingest.ts#L1-L77)
- [src/lib/rag/loader.ts](file://src/lib/rag/loader.ts#L145-L211)
- [src/lib/embeddings/base.ts](file://src/lib/embeddings/base.ts#L17-L35)