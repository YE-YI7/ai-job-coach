# FaissStoreWrapper 使用指南

## 概述

`FaissStoreWrapper` 是一个基于 `faiss-node` 的向量存储包装类，用于存储和检索 LangChain Document 对象。它不使用 LangChain 内置的 Faiss 实现，而是直接使用 `faiss-node` 库。

## 功能特性

- ✅ 使用 `faiss-node` 实现（不使用 LangChain 内置 Faiss）
- ✅ 支持添加文档到向量存储
- ✅ 支持相似度搜索
- ✅ 支持保存和加载索引
- ✅ 支持作为 LangChain Retriever 使用
- ✅ 自动处理向量维度检测

## 基本使用

### 1. 创建实例

```typescript
import { FaissStoreWrapper } from "@/lib/vectorstore/faiss";
import { EmbeddingProvider } from "@/lib/embeddings/base";

// 创建 EmbeddingProvider
const embeddingProvider = new EmbeddingProvider();

// 创建 FaissStoreWrapper（维度会自动检测，也可以手动指定）
const faissStore = new FaissStoreWrapper(embeddingProvider);
```

### 2. 添加文档

```typescript
import { Document } from "@langchain/core/documents";

const documents: Document[] = [
  new Document({
    pageContent: "这是第一篇文档的内容...",
    metadata: { source: "doc1.md", title: "文档1" },
  }),
  new Document({
    pageContent: "这是第二篇文档的内容...",
    metadata: { source: "doc2.md", title: "文档2" },
  }),
];

// 添加文档到索引
await faissStore.addDocuments(documents);
```

### 3. 搜索文档

```typescript
// 搜索相似文档
const query = "搜索关键词";
const results = await faissStore.search(query, 5); // 返回最相似的 5 个文档

results.forEach((doc, index) => {
  console.log(`${index + 1}. ${doc.metadata.title}`);
  console.log(`   内容: ${doc.pageContent.substring(0, 100)}...`);
});
```

### 4. 保存索引

```typescript
// 保存到默认路径：src/lib/knowledge/faiss-index/
await faissStore.save();

// 或保存到自定义路径
await faissStore.save("/path/to/custom/directory");
```

保存后的目录结构：
```
src/lib/knowledge/faiss-index/
├── index.bin    # FAISS 索引文件
└── meta.json    # 元数据文件（包含文档信息和维度）
```

### 5. 加载索引

```typescript
// 从指定目录加载索引
const loadedStore = await FaissStoreWrapper.load(
  "src/lib/knowledge/faiss-index",
  embeddingProvider
);

// 加载后可以直接使用
const results = await loadedStore.search("查询", 3);
```

### 6. 作为 Retriever 使用

```typescript
// 获取 Retriever（用于 LangChain RAG Chain）
const retriever = faissStore.asRetriever(4); // 返回 4 个结果

// 在 RAG Chain 中使用
import { createRAGChain } from "@/lib/chains/rag";
import { getLLM } from "@/lib/llm";

const llm = getLLM();
const ragChain = createRAGChain(llm, retriever);

const result = await ragChain.invoke({
  query: "用户的问题",
  chat_history: [],
});
```

## 完整示例

```typescript
import { FaissStoreWrapper } from "@/lib/vectorstore/faiss";
import { EmbeddingProvider } from "@/lib/embeddings/base";
import { loadKnowledgeBase } from "@/lib/rag/loader";
import { Document } from "@langchain/core/documents";

async function buildKnowledgeBase() {
  // 1. 创建 EmbeddingProvider
  const embeddingProvider = new EmbeddingProvider();

  // 2. 创建 FaissStoreWrapper
  const faissStore = new FaissStoreWrapper(embeddingProvider);

  // 3. 加载知识库文档
  const documents = await loadKnowledgeBase();

  // 4. 添加文档到索引
  console.log(`正在添加 ${documents.length} 个文档...`);
  await faissStore.addDocuments(documents);

  // 5. 保存索引
  await faissStore.save();
  console.log("索引保存完成！");

  return faissStore;
}

async function searchKnowledge(query: string) {
  // 1. 创建 EmbeddingProvider
  const embeddingProvider = new EmbeddingProvider();

  // 2. 加载索引
  const faissStore = await FaissStoreWrapper.load(
    "src/lib/knowledge/faiss-index",
    embeddingProvider
  );

  // 3. 搜索
  const results = await faissStore.search(query, 5);
  
  return results;
}

// 使用示例
async function main() {
  // 构建知识库
  await buildKnowledgeBase();

  // 搜索
  const results = await searchKnowledge("如何写简历？");
  console.log("搜索结果:", results);
}
```

## API 参考

### 构造函数

```typescript
constructor(
  embeddingProvider: EmbeddingProvider,
  dimension?: number,
  indexPath?: string
)
```

- `embeddingProvider`: EmbeddingProvider 实例
- `dimension`: 向量维度（可选，会在首次添加文档时自动检测）
- `indexPath`: 索引存储路径（可选，默认为 `src/lib/knowledge/faiss-index`）

### 方法

#### `addDocuments(docs: Document[]): Promise<void>`

添加文档到向量存储。

#### `search(query: string, k: number): Promise<Document[]>`

搜索相似文档。

- `query`: 查询文本
- `k`: 返回结果数量
- 返回: 相似文档数组

#### `save(dir?: string): Promise<void>`

保存索引到磁盘。

- `dir`: 保存目录（可选，默认使用构造函数中的路径）

#### `static load(dir: string, embeddingProvider: EmbeddingProvider): Promise<FaissStoreWrapper>`

从磁盘加载索引。

- `dir`: 索引目录
- `embeddingProvider`: EmbeddingProvider 实例
- 返回: FaissStoreWrapper 实例

#### `asRetriever(k?: number): VectorStoreRetriever`

获取检索器，用于在 LangChain Chains 中使用。

- `k`: 返回结果数量（默认 4）
- 返回: VectorStoreRetriever 实例

#### `getDocumentCount(): number`

获取索引中的文档数量。

#### `isInitialized(): boolean`

检查索引是否已初始化。

#### `clear(): void`

清空索引。

## 注意事项

1. **向量维度**: 如果不指定维度，会在首次添加文档时自动检测。BAAI/bge-small-zh-v1.5 的维度是 512。

2. **索引路径**: 默认索引路径是 `src/lib/knowledge/faiss-index/`，包含：
   - `index.bin`: FAISS 索引文件
   - `meta.json`: 元数据文件

3. **文档映射**: 每个文档在索引中都有一个唯一的 ID，用于在搜索时映射回原始文档。

4. **性能**: 对于大量文档，建议定期保存索引以避免数据丢失。

5. **线程安全**: 当前实现不是线程安全的，如果在多线程环境中使用，需要添加同步机制。

## 测试

运行测试文件：

```bash
npx tsx src/lib/vectorstore/test-faiss.ts
```

## 故障排除

### 问题：维度不匹配错误

**原因**: 索引的维度与嵌入向量的维度不匹配。

**解决方案**: 
- 确保使用相同的 EmbeddingProvider
- 或者清空索引重新构建

### 问题：索引文件不存在

**原因**: 尝试加载不存在的索引。

**解决方案**: 
- 先调用 `addDocuments` 添加文档
- 然后调用 `save` 保存索引

### 问题：搜索返回空结果

**原因**: 索引为空或查询向量有问题。

**解决方案**: 
- 检查索引是否已初始化：`faissStore.isInitialized()`
- 检查文档数量：`faissStore.getDocumentCount()`
- 确保已添加文档到索引

