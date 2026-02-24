# src/lib 模块概览

## 📁 目录结构

```
src/lib/
├── agents/          # 智能 Agent
├── chains/           # LangChain 链
├── embeddings/       # 文本嵌入
├── knowledge/        # 知识库文档
│   └── base/         # 知识库文档文件（.md 文件）
├── llm/             # 大语言模型
├── rag/             # RAG 文档加载器
├── state/            # 状态机
└── vectorstore/      # 向量存储

scripts/
└── ingest.ts         # 知识库摄入脚本
```

## 📦 模块功能说明

### 🤖 agents/ - 智能 Agent

**文件：**
- `jobcoach.ts` - JobCoachAgent 类实现
- `index.ts` - 导出文件

**功能：**
- 求职教练智能 Agent，管理求职流程的各个阶段
- 注册 6 个工具：职业规划、项目梳理、简历优化、面试辅导、薪资谈判、Offer 总结
- 根据状态机当前阶段，只允许调用对应的工具
- 处理状态流转逻辑（in_progress / completed / blocked）

**导出：**
- `JobCoachAgent` 类
- `jobCoachAgent` 单例
- `AgentOutput`, `AgentStatus`, `JobCoachAgentInput` 类型

---

### 🔗 chains/ - LangChain 链

**文件：**
- `rag.ts` - RAG Chain 实现
- `parse_resume.ts` - 简历解析 Chain
- `schemas.ts` - 简历结构化 Schema（Zod）
- `test-chains.ts` - 测试文件
- `index.ts` - 导出文件

**功能：**

1. **RAG Chain** (`rag.ts`)
   - 检索增强生成（RAG）Chain
   - 使用 LCEL (LangChain Expression Language) 构建
   - 支持 RunnableParallel + RunnablePassthrough 管道
   - 集成向量检索和 LLM 生成
   - 提供 `createRAGChain()` 函数和 `RAGChain` 包装类

2. **简历解析 Chain** (`parse_resume.ts`)
   - 将纯文本简历解析为结构化 JSON
   - 使用 `withStructuredOutput` 实现强制结构化输出（无幻觉）
   - 支持回退方案：普通 LLM 调用 + JSON 解析
   - 使用 Zod Schema 验证输出结果
   - 导出 `parseResume(text: string): Promise<Resume>` 函数

3. **简历 Schema** (`schemas.ts`)
   - 使用 Zod 定义强类型简历结构
   - 包含：个人信息、教育经历、工作经历、项目经验、技能
   - 导出 `ResumeSchema` 和 `Resume` 类型

**导出：**
- `createRAGChain()`, `RAGChain` 类
- `parseResume()` 函数
- `ResumeSchema`, `Resume` 类型
- `RAGChainInput`, `RAGChainOutput` 类型

---

### 🔤 embeddings/ - 文本嵌入

**文件：**
- `base.ts` - EmbeddingProvider 类实现
- `index.ts` - 导出文件

**功能：**
- 使用 HuggingFace Transformers 提供文本嵌入
- 默认模型：BAAI/bge-small-zh-v1.5（中文优化，维度 512）
- 支持单个文本和批量文档嵌入
- 兼容 LangChain 文档加载器
- 提供 `embedText()`, `embedDocuments()`, `embedLangChainDocuments()` 方法

**导出：**
- `EmbeddingProvider` 类

---

### 📚 knowledge/ - 知识库

**文件：**
- `base/` - 知识库文档目录
  - `求职指南-岗位解析.md`
  - `求职指南-简历写法.md`
  - `求职指南-行业分析.md`
  - `求职指南-谈薪策略.md`
  - `求职指南-面试技巧.md`
- `index.ts` - 导出文件（预留）

**功能：**
- 存储求职相关的知识库文档（Markdown 格式）
- 文档会被 `rag/loader.ts` 加载并切分为 chunks
- 向量索引存储在：`/src/lib/knowledge/faiss-index/`

---

### 💬 llm/ - 大语言模型

**文件：**
- `base.ts` - LLMProvider 类实现
- `test-llm.ts` - 测试文件
- `index.ts` - 导出文件

**功能：**
- 统一管理不同 LLM 提供商的调用
- 支持模型：deepseek（默认）、openai、qwen
- 提供多种调用方式：
  - `call(params: LLMCallParams | string)` - 支持直接传字符串或参数对象
  - `stream(params: LLMCallParams)` - 流式调用
  - `embed(text: string | string[])` - 生成嵌入向量
  - `structured<T>(text: string, schema: T)` - 结构化输出（使用 Zod Schema）
- 兼容 LangChain ChatModel，失败时回退到 OpenAI SDK
- 自动检测并优先使用 LangChain 包装器

**导出：**
- `LLMProvider` 类
- `ModelType`, `LLMCallParams`, `StreamChunk` 类型

**使用示例：**
```typescript
const llm = new LLMProvider("deepseek");

// 简化调用
const response = await llm.call("你好");

// 结构化输出
const resume = await llm.structured("解析此文本…", ResumeSchema);
```

---

### 📄 rag/ - RAG 文档加载器

**文件：**
- `loader.ts` - 文档加载器实现

**功能：**
- 递归读取 `/src/lib/knowledge/` 目录下的所有文档
- 支持格式：`.md`, `.txt`, `.pdf`, `.docx`
  - PDF → 使用 `pdf-parse`
  - DOCX → 使用 `mammoth`
- 使用 `RecursiveCharacterTextSplitter` 切分文档
  - `chunkSize: 500`
  - `chunkOverlap: 50`
- 输出为 LangChain `Document[]`
- 每个文档块包含元数据：`source`, `fileName`, `chunkIndex`, `totalChunks`

**导出：**
- `loadKnowledgeBase(): Promise<Document[]>` 函数

---

### 🔄 state/ - 状态机

**文件：**
- `machine.ts` - StateMachine 类实现
- `index.ts` - 导出文件

**功能：**
- 管理求职流程的各个阶段
- 阶段顺序：career_plan → project_review → resume_edit → interview → negotiation → offer
- 使用 zod 校验阶段名称有效性
- 提供 `getPhase()`, `setPhase()`, `next()` 方法

**导出：**
- `StateMachine` 类
- `stateMachine` 单例
- `PHASES` 常量
- `Phase` 类型

---

### 💾 vectorstore/ - 向量存储

**文件：**
- `faiss.ts` - FaissStoreWrapper 类实现
- `README.md` - 使用文档
- `test-faiss.ts` - 测试文件
- `index.ts` - 导出文件

**功能：**
- 使用 `faiss-node` 实现向量存储（**不使用 LangChain 内置 Faiss**）
- 提供完整的向量存储功能：
  - `addDocuments(docs: Document[])` - 添加文档到向量存储
  - `search(query: string, k: number)` - 搜索相似文档
  - `save(dir?: string)` - 保存索引到磁盘
  - `static load(dir: string, embeddingProvider)` - 从磁盘加载索引
  - `asRetriever(k?: number)` - 获取检索器（用于 LangChain Chains）
- 默认存储路径：`/src/lib/knowledge/faiss-index/`
- 保存结构：
  ```
  faiss-index/
  ├── index.bin    # FAISS 索引文件
  └── meta.json    # 元数据文件（包含文档信息和维度）
  ```
- 自动检测向量维度
- 兼容 LangChain Retriever 接口

**导出：**
- `FaissStoreWrapper` 类

---

### 📜 scripts/ - 脚本工具

**文件：**
- `ingest.ts` - 知识库摄入脚本

**功能：**
- 知识库摄入流程：
  1. 调用 `loadKnowledgeBase()` 加载文档
  2. 使用 `EmbeddingProvider` 嵌入所有 chunks
  3. 使用 `FaissStoreWrapper` 保存向量数据库
- 输出格式：
  ```
  Loaded X docs.
  Created Y chunks.
  Embedding done.
  FAISS index saved to src/lib/knowledge/faiss-index
  ```

**运行方式：**
```bash
npx ts-node scripts/ingest.ts
# 或
npm run ingest
```

---

## 🔄 模块间关系

```
┌─────────────┐
│   state/    │ ← 状态机管理阶段流转
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  agents/    │ ← 根据当前阶段调用对应工具
└──────┬──────┘
       │
       ↓
┌─────────────┐     ┌──────────────┐
│    llm/     │ ←── │ embeddings/  │
└──────┬──────┘     └──────┬───────┘
       │                   │
       ↓                   ↓
┌─────────────┐     ┌──────────────┐
│  chains/    │ ←── │ vectorstore/ │
└──────┬──────┘     └──────┬───────┘
       │                   │
       ↓                   ↓
┌─────────────┐     ┌──────────────┐
│   rag/      │ ───→│ knowledge/   │
└─────────────┘     └──────────────┘
```

## 📝 使用流程示例

### 1. 知识库摄入流程

```typescript
// 运行摄入脚本
npm run ingest

// 流程：
// 1. loadKnowledgeBase() → 加载并切分文档
// 2. EmbeddingProvider → 嵌入所有 chunks
// 3. FaissStoreWrapper.addDocuments() → 添加到向量存储
// 4. FaissStoreWrapper.save() → 保存索引
```

### 2. 简历解析流程

```typescript
import { parseResume } from "@/lib/chains/parse_resume";

const resumeText = "张三，毕业于清华大学…";
const resume = await parseResume(resumeText);
// 返回符合 ResumeSchema 的结构化 JSON
```

### 3. RAG 问答流程

```typescript
import { createRAGChain } from "@/lib/chains/rag";
import { LLMProvider } from "@/lib/llm/base";
import { EmbeddingProvider } from "@/lib/embeddings/base";
import { FaissStoreWrapper } from "@/lib/vectorstore/faiss";

// 1. 创建 LLM
const llmProvider = new LLMProvider("deepseek");
const llm = llmProvider.getLangChainModel()!;

// 2. 加载向量存储
const embeddingProvider = new EmbeddingProvider();
const faissStore = await FaissStoreWrapper.load(
  "src/lib/knowledge/faiss-index",
  embeddingProvider
);

// 3. 创建 Retriever
const retriever = faissStore.asRetriever(3);

// 4. 创建 RAG Chain
const rag = createRAGChain(llm, retriever);

// 5. 查询
const result = await rag.invoke({
  query: "如何写简历中的项目经历?",
  chat_history: [],
});

console.log(result.answer); // 答案
```

### 4. Agent 工作流程

```typescript
// 1. 初始化阶段
stateMachine.setPhase("career_plan");

// 2. Agent 调用
const result = await jobCoachAgent.run({
  input: "我想转行做产品经理",
  currentPhase: stateMachine.getPhase(),
});

// 3. 状态流转
if (result.status === "completed") {
  stateMachine.next();
}
```

## 🎯 核心设计理念

- **模块化**：每个模块职责单一，易于维护
- **类型安全**：使用 TypeScript 和 zod 确保类型安全
- **兼容性**：兼容 LangChain 生态，支持多种 LLM 提供商
- **无幻觉输出**：使用结构化输出（`withStructuredOutput`）确保数据准确性
- **可扩展**：预留接口，便于后续接入 Supabase 等外部服务

## 🧪 测试文件

- `src/lib/chains/test-chains.ts` - 测试 parseResume 和 RAG Chain
- `src/lib/llm/test-llm.ts` - 测试 LLMProvider
- `src/lib/vectorstore/test-faiss.ts` - 测试 FaissStoreWrapper

## 📚 相关文档

- `src/lib/vectorstore/README.md` - FaissStoreWrapper 使用指南
