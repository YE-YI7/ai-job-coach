/**
 * 知识库摄入脚本
 * 用于将知识库文档加载、嵌入并保存到 FAISS 向量数据库
 * 
 * 运行方式：
 * npx ts-node scripts/ingest.ts
 */

import { loadKnowledgeBase } from "../src/lib/rag/loader";
import { EmbeddingProvider } from "../src/lib/embeddings/base";
import { HNSWLibStoreWrapper } from "../src/lib/vectorstore/hnswlib";
import * as path from "path";

/**
 * 主函数：执行知识库摄入流程
 */
async function ingest() {
  try {
    // 1. 加载知识库文档（已经切分为 chunks）
    // 注意：loadKnowledgeBase 内部已经有 console.log，我们需要在它之后输出统计信息
    const documents = await loadKnowledgeBase();

    if (documents.length === 0) {
      console.error("错误：未找到任何文档！");
      process.exit(1);
    }

    // 统计原始文档数量（通过 metadata.fileName 去重）
    const uniqueFiles = new Set<string>();
    documents.forEach((doc) => {
      if (doc.metadata?.fileName) {
        uniqueFiles.add(doc.metadata.fileName);
      }
    });
    const docCount = uniqueFiles.size;
    const chunkCount = documents.length;

    // 输出指定格式的日志
    console.log(`Loaded ${docCount} docs.`);
    console.log(`Created ${chunkCount} chunks.`);

    // 2. 创建 EmbeddingProvider
    const embeddingProvider = new EmbeddingProvider();

    // 3. 创建 HNSWLibStoreWrapper
    const faissStore = new HNSWLibStoreWrapper(embeddingProvider);

    // 4. 添加文档到向量存储（会自动进行嵌入）
    await faissStore.addDocuments(documents);

    console.log("Embedding done.");

    // 5. 保存 HNSWLib 索引
    const indexPath = path.join(
      process.cwd(),
      "src",
      "lib",
      "knowledge",
      "hnswlib-index"
    );
    await faissStore.save();

    console.log(`HNSWLib index saved to src/lib/knowledge/hnswlib-index`);
  } catch (error) {
    console.error("❌ 知识库摄入失败:", error);
    if (error instanceof Error) {
      console.error("错误详情:", error.message);
      console.error("错误堆栈:", error.stack);
    }
    process.exit(1);
  }
}

// 运行主函数
ingest();

