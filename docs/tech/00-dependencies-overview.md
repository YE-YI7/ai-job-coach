# 依赖概览文档

## Step 1: 基础环境与依赖安装

本文档记录了 AI Job Coach 项目的所有核心依赖及其用途。

## 核心架构依赖

### LangChain 生态

#### `langchain` (^0.3.0)
- **用途**: LangChain 核心库，提供 LCEL (LangChain Expression Language) 和 Runnable 接口
- **在项目中的作用**: 
  - 所有节点使用 LCEL Runnable 实现
  - 提供统一的模型调用接口
  - 支持链式组合和流式处理

#### `@langchain/langgraph` (^0.2.0)
- **用途**: LangGraph 库，用于构建显式状态机
- **在项目中的作用**:
  - 驱动整个求职辅导流程的状态机
  - 管理节点之间的状态转换
  - 支持条件分支和循环

### 向量数据库与 RAG

#### `chromadb` (^1.8.1)
- **用途**: 轻量级向量数据库
- **在项目中的作用**:
  - 存储求职知识库的 Embedding 向量
  - 支持语义搜索和检索增强生成 (RAG)
  - 提供快速相似度查询

#### `huggingface-hub` (^0.24.0)
- **用途**: Hugging Face 模型和数据集访问
- **在项目中的作用**:
  - 下载和使用 Embedding 模型
  - 访问预训练模型和知识库
  - 支持模型版本管理

### 文件处理

#### `pdf-parse` (^1.1.1)
- **用途**: PDF 文件文本提取
- **在项目中的作用**:
  - 解析用户上传的 PDF 简历
  - 提取简历文本内容用于解析

#### `mammoth` (^1.6.0)
- **用途**: DOCX 文件文本提取
- **在项目中的作用**:
  - 解析用户上传的 Word 简历
  - 提取简历文本内容用于解析

#### `formidable` (^3.5.1)
- **用途**: 文件上传处理
- **在项目中的作用**:
  - 处理多部分表单数据
  - 解析文件上传请求
  - 支持大文件上传

### 工具库

#### `uuid` (^9.0.1)
- **用途**: UUID 生成
- **在项目中的作用**:
  - 生成唯一会话 ID
  - 生成唯一文档 ID
  - 确保数据唯一性

#### `zod` (^3.23.8)
- **用途**: TypeScript 优先的模式验证
- **在项目中的作用**:
  - 验证 API 请求参数
  - 验证数据模型结构
  - 提供类型安全的验证

#### `node-fetch` (^3.3.2)
- **用途**: Node.js 的 fetch API 实现
- **在项目中的作用**:
  - 调用外部 API
  - 下载模型和资源
  - 支持流式响应

#### `dotenv` (^16.4.5)
- **用途**: 环境变量管理
- **在项目中的作用**:
  - 加载 `.env` 文件
  - 管理敏感配置信息
  - 支持多环境配置

### 开发工具

#### `typescript` (^5)
- **用途**: TypeScript 编译器
- **在项目中的作用**:
  - 提供类型检查
  - 增强代码可维护性
  - 支持现代 JavaScript 特性

## 版本兼容性

所有依赖均兼容 **Node.js 18+**，具体测试版本：
- Node.js 18.x ✅
- Node.js 20.x ✅
- Node.js 22.x ✅

## 安装命令

```bash
npm install
```

或使用 yarn:

```bash
yarn install
```

## 依赖分类

### 运行时依赖 (dependencies)
- `@langchain/langgraph` - 状态机框架
- `langchain` - LangChain 核心
- `chromadb` - 向量数据库
- `huggingface-hub` - 模型访问
- `pdf-parse` - PDF 解析
- `mammoth` - DOCX 解析
- `formidable` - 文件上传
- `uuid` - UUID 生成
- `zod` - 数据验证
- `node-fetch` - HTTP 客户端
- `dotenv` - 环境变量

### 开发依赖 (devDependencies)
- `typescript` - TypeScript 编译器
- `@types/formidable` - Formidable 类型定义
- `@types/node-fetch` - node-fetch 类型定义

## 架构说明

### 状态机驱动
使用 LangGraph 构建显式状态机，管理以下节点：
- 职业规划 (Career Planning)
- 项目复盘 (Project Review)
- 简历解析 (Resume Parsing)
- 求职知识库 (Job Knowledge Base)
- 模拟面试 (Mock Interview)

### 共享 Memory
所有节点共享两种类型的记忆：
- **Core Memory**: 用户基本信息、职业目标、核心技能
- **Working Memory**: 当前会话的临时信息、上下文

### RAG 增强
使用 ChromaDB 存储知识库向量，通过 RAG 增强：
- Embedding 模型将知识库内容向量化
- VectorStore 存储和检索向量
- Retriever 根据用户查询检索相关内容

### 模型适配
通过 Orchestrator 适配不同模型：
- DeepSeek
- Qwen
- Baichuan
- OpenAI

## 下一步

安装完成后，进入 **Step 2: RAG 构建**，包括：
1. 配置 Embedding 模型
2. 初始化 ChromaDB
3. 构建知识库向量存储
4. 实现 Retriever




