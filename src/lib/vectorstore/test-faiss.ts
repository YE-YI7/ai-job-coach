/**
 * FaissStoreWrapper 测试文件
 * 用于验证 FaissStoreWrapper 的功能
 * 
 * 运行方式：
 * npx tsx src/lib/vectorstore/test-faiss.ts
 */

import { HNSWLibStoreWrapper } from "./hnswlib";
import { EmbeddingProvider } from "../embeddings/base";
// LangChain 已移除，以下导入已注释
// import { Document } from "@langchain/core/documents";
import * as path from "path";
import * as fs from "fs";

// 临时 Document 类定义（用于兼容）
class Document {
  pageContent: string;
  metadata: Record<string, any>;
  
  constructor(data: { pageContent: string; metadata?: Record<string, any> }) {
    this.pageContent = data.pageContent;
    this.metadata = data.metadata || {};
  }
}

async function testFaissStoreWrapper() {
  console.log("开始测试 FaissStoreWrapper...\n");

  // 创建 EmbeddingProvider
  console.log("1. 创建 EmbeddingProvider...");
  const embeddingProvider = new EmbeddingProvider();
  console.log("   ✓ EmbeddingProvider 创建成功\n");

  // 创建 HNSWLibStoreWrapper
  console.log("2. 创建 HNSWLibStoreWrapper...");
  const testIndexPath = path.join(process.cwd(), "src", "lib", "knowledge", "hnswlib-index-test");
  const faissStore = new HNSWLibStoreWrapper(embeddingProvider, 512, testIndexPath);
  console.log("   ✓ HNSWLibStoreWrapper 创建成功\n");

  // 测试添加文档
  console.log("3. 测试添加文档...");
  const testDocuments: Document[] = [
    new Document({
      pageContent: "这是第一篇测试文档，关于人工智能和机器学习。",
      metadata: { source: "test1.md", title: "AI 介绍" },
    }),
    new Document({
      pageContent: "这是第二篇测试文档，关于自然语言处理。",
      metadata: { source: "test2.md", title: "NLP 介绍" },
    }),
    new Document({
      pageContent: "这是第三篇测试文档，关于深度学习。",
      metadata: { source: "test3.md", title: "深度学习介绍" },
    }),
  ];

  try {
    await faissStore.addDocuments(testDocuments);
    console.log(`   ✓ 成功添加 ${testDocuments.length} 个文档`);
    console.log(`   ✓ 索引中总共有 ${faissStore.getDocumentCount()} 个文档\n`);
  } catch (error) {
    console.error("   ✗ 添加文档失败:", error);
    return;
  }

  // 测试搜索
  console.log("4. 测试搜索功能...");
  try {
    const query = "人工智能";
    const results = await faissStore.search(query, 2);
    console.log(`   ✓ 搜索查询: "${query}"`);
    console.log(`   ✓ 找到 ${results.length} 个相关文档:`);
    results.forEach((doc, index) => {
      console.log(`     ${index + 1}. ${doc.metadata.title || "无标题"}`);
      console.log(`        内容: ${doc.pageContent.substring(0, 50)}...`);
    });
    console.log();
  } catch (error) {
    console.error("   ✗ 搜索失败:", error);
    return;
  }

  // 测试保存
  console.log("5. 测试保存索引...");
  try {
    await faissStore.save();
    console.log("   ✓ 索引保存成功\n");
  } catch (error) {
    console.error("   ✗ 保存索引失败:", error);
    return;
  }

  // 测试加载
  console.log("6. 测试加载索引...");
  try {
    const loadedStore = await HNSWLibStoreWrapper.load(testIndexPath, embeddingProvider);
    console.log(`   ✓ 索引加载成功`);
    console.log(`   ✓ 加载的索引包含 ${loadedStore.getDocumentCount()} 个文档\n`);

    // 测试加载后的搜索
    console.log("7. 测试加载后的搜索功能...");
    const query2 = "机器学习";
    const results2 = await loadedStore.search(query2, 2);
    console.log(`   ✓ 搜索查询: "${query2}"`);
    console.log(`   ✓ 找到 ${results2.length} 个相关文档:`);
    results2.forEach((doc, index) => {
      console.log(`     ${index + 1}. ${doc.metadata.title || "无标题"}`);
      console.log(`        内容: ${doc.pageContent.substring(0, 50)}...`);
    });
    console.log();
  } catch (error) {
    console.error("   ✗ 加载索引失败:", error);
    return;
  }

  // 测试 asRetriever
  console.log("8. 测试 asRetriever...");
  try {
    const retriever = faissStore.asRetriever(2);
    const retrievedDocs = await retriever.getRelevantDocuments("深度学习");
    console.log(`   ✓ Retriever 检索成功，返回 ${retrievedDocs.length} 个文档\n`);
  } catch (error) {
    console.error("   ✗ Retriever 测试失败:", error);
    return;
  }

  // 清理测试文件
  console.log("9. 清理测试文件...");
  try {
    if (fs.existsSync(testIndexPath)) {
      fs.rmSync(testIndexPath, { recursive: true, force: true });
      console.log("   ✓ 测试文件清理完成\n");
    }
  } catch (error) {
    console.warn("   ⚠ 清理测试文件失败:", error);
  }

  console.log("✅ 所有测试通过！");
}

// 运行测试
testFaissStoreWrapper().catch((error) => {
  console.error("测试失败:", error);
  process.exit(1);
});

