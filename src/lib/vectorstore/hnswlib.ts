import * as fs from "fs";
import * as path from "path";
import { HierarchicalNSW } from "hnswlib-node";
// LangChain 已移除，以下导入已注释
// import { Document } from "@langchain/core/documents";
// import type { VectorStoreRetriever } from "@langchain/core/vectorstores";
import { EmbeddingProvider } from "../embeddings/base";

// 临时 Document 类定义（用于兼容）
class Document {
  pageContent: string;
  metadata: Record<string, any>;
  
  constructor(data: { pageContent: string; metadata?: Record<string, any> }) {
    this.pageContent = data.pageContent;
    this.metadata = data.metadata || {};
  }
}

type VectorStoreRetriever = any;

/**
 * 元数据接口
 */
interface HNSWLibMetadata {
  dimension: number;
  documentCount: number;
  maxElements: number;
  documents: Array<{
    id: number;
    pageContent: string;
    metadata: Record<string, any>;
  }>;
}

/**
 * HNSWLibStoreWrapper 类
 * 使用 hnswlib-node 实现向量存储（Vercel 兼容）
 */
export class HNSWLibStoreWrapper {
  private index: HierarchicalNSW | null = null;
  private embeddingProvider: EmbeddingProvider;
  private dimension: number;
  private maxElements: number;
  private documents: Map<number, Document> = new Map();
  private nextId: number = 0;
  private indexPath: string;

  /**
   * 构造函数
   * @param embeddingProvider EmbeddingProvider 实例
   * @param dimension 向量维度（可选，如果不提供会在首次添加文档时自动检测）
   * @param indexPath 索引存储路径，默认为 /src/lib/knowledge/hnswlib-index
   * @param maxElements 最大元素数量，默认为 10000
   */
  constructor(
    embeddingProvider: EmbeddingProvider,
    dimension?: number,
    indexPath?: string,
    maxElements?: number
  ) {
    this.embeddingProvider = embeddingProvider;
    // 默认存储路径
    // 生产环境使用 /app/hnswlib，开发环境使用 src/lib/knowledge/hnswlib-index
    this.indexPath = indexPath || (process.env.NODE_ENV === "production"
      ? path.join("/app", "hnswlib")
      : path.join(
          process.cwd(),
          "src",
          "lib",
          "knowledge",
          "hnswlib-index"
        ));
    
    // 如果没有提供维度，会在首次添加文档时自动检测
    // 注意：BAAI/bge-small-zh-v1.5 的维度是 512
    this.dimension = dimension || 512;
    this.maxElements = maxElements || 10000;
    
    // 确保目录存在
    this.ensureDirectoryExists();
  }

  /**
   * 确保存储目录存在
   */
  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.indexPath)) {
      fs.mkdirSync(this.indexPath, { recursive: true });
    }
  }

  /**
   * 初始化索引
   */
  private initializeIndex(): void {
    if (!this.index) {
      this.index = new HierarchicalNSW("l2", this.dimension);
      this.index.initIndex(this.maxElements);
    }
  }

  /**
   * 添加文档到向量存储
   * @param docs 要添加的文档数组
   */
  async addDocuments(docs: Document[]): Promise<void> {
    if (!docs || docs.length === 0) {
      return;
    }

    // 提取文档文本
    const texts = docs.map((doc) => doc.pageContent);

    // 获取嵌入向量
    const embeddings = await this.embeddingProvider.embedDocuments(texts);

    // 验证或设置维度
    if (embeddings.length > 0) {
      const actualDimension = embeddings[0].length;
      
      // 如果维度不匹配，需要重新创建索引
      if (this.index && actualDimension !== this.dimension) {
        console.warn(
          `维度不匹配：期望 ${this.dimension}，实际 ${actualDimension}。将重新创建索引。`
        );
        this.index = new HierarchicalNSW("l2", actualDimension);
        this.index.initIndex(this.maxElements);
        // 清空已有文档（因为维度改变了）
        this.documents.clear();
        this.nextId = 0;
      }
      
      // 更新维度
      this.dimension = actualDimension;
    }

    // 初始化索引（如果还没有）
    this.initializeIndex();

    // 添加到索引（HNSWLib 的 addPoint 方法接受向量数组和 id）
    for (let i = 0; i < embeddings.length; i++) {
      const id = this.nextId++;
      // HNSWLib 的 addPoint 方法接受向量数组和 id
      this.index!.addPoint(embeddings[i] as number[], id);
      // 存储文档映射
      this.documents.set(id, docs[i]);
    }
  }

  /**
   * 搜索相似文档
   * @param query 查询文本
   * @param k 返回结果数量
   * @returns 相似文档数组
   */
  async search(query: string, k: number): Promise<Document[]> {
    if (!this.index || this.getDocumentCount() === 0) {
      return [];
    }

    // 获取查询向量
    const queryEmbedding = await this.embeddingProvider.embedText(query);

    // 搜索（HNSWLib 的 searchKnn 方法接受向量数组和 k）
    const { neighbors, distances } = this.index.searchKnn(queryEmbedding as number[], k);

    // 构建结果文档数组
    const results: Document[] = [];
    for (let i = 0; i < neighbors.length; i++) {
      const id = neighbors[i];
      if (id >= 0 && this.documents.has(id)) {
        const doc = this.documents.get(id)!;
        results.push(doc);
      }
    }

    return results;
  }

  /**
   * 保存索引到磁盘
   * @param dir 保存目录（可选，默认使用构造函数中的路径）
   */
  async save(dir?: string): Promise<void> {
    const saveDir = dir || this.indexPath;
    this.ensureDirectoryExists();

    if (!this.index) {
      throw new Error("索引未初始化，无法保存");
    }

    try {
      // 保存 HNSWLib 索引（hnswlib-node 使用 writeIndex 方法）
      const indexFile = path.join(saveDir, "index.bin");
      this.index.writeIndex(indexFile);

      // 保存元数据
      const metadata: HNSWLibMetadata = {
        dimension: this.dimension,
        documentCount: this.documents.size,
        maxElements: this.maxElements,
        documents: Array.from(this.documents.entries()).map(([id, doc]) => ({
          id,
          pageContent: doc.pageContent,
          metadata: doc.metadata,
        })),
      };

      const metaFile = path.join(saveDir, "meta.json");
      fs.writeFileSync(metaFile, JSON.stringify(metadata, null, 2), "utf-8");

      console.log(`索引已保存到: ${saveDir}`);
    } catch (error) {
      console.error("保存索引失败:", error);
      throw new Error(
        `保存索引失败: ${error instanceof Error ? error.message : "未知错误"}`
      );
    }
  }

  /**
   * 从磁盘加载索引
   * @param dir 索引目录
   * @param embeddingProvider EmbeddingProvider 实例
   * @returns HNSWLibStoreWrapper 实例
   */
  static async load(
    dir: string,
    embeddingProvider: EmbeddingProvider
  ): Promise<HNSWLibStoreWrapper> {
    const indexFile = path.join(dir, "index.bin");
    const metaFile = path.join(dir, "meta.json");

    if (!fs.existsSync(indexFile) || !fs.existsSync(metaFile)) {
      throw new Error(`索引文件不存在: ${dir}`);
    }

    try {
      // 读取元数据
      const metaContent = fs.readFileSync(metaFile, "utf-8");
      const metadata: HNSWLibMetadata = JSON.parse(metaContent);

      // 创建实例
      const wrapper = new HNSWLibStoreWrapper(
        embeddingProvider,
        metadata.dimension,
        dir,
        metadata.maxElements
      );

      // 加载索引（hnswlib-node 使用 readIndex 方法）
      wrapper.index = new HierarchicalNSW("l2", metadata.dimension);
      wrapper.index.readIndex(indexFile);
      wrapper.dimension = metadata.dimension;
      wrapper.maxElements = metadata.maxElements;

      // 恢复文档映射
      wrapper.documents.clear();
      let maxId = -1;
      for (const docData of metadata.documents) {
        wrapper.documents.set(
          docData.id,
          new Document({
            pageContent: docData.pageContent,
            metadata: docData.metadata,
          })
        );
        if (docData.id > maxId) {
          maxId = docData.id;
        }
      }
      wrapper.nextId = maxId + 1;

      console.log(`索引已从 ${dir} 加载，包含 ${wrapper.documents.size} 个文档`);
      return wrapper;
    } catch (error) {
      console.error("加载索引失败:", error);
      throw new Error(
        `加载索引失败: ${error instanceof Error ? error.message : "未知错误"}`
      );
    }
  }

  /**
   * 获取检索器（Retriever）
   * 用于在 LangChain Chains 中使用
   * @param k 返回结果数量，默认为 4
   * @returns VectorStoreRetriever 检索器实例
   */
  asRetriever(k?: number): VectorStoreRetriever {
    const defaultK = k || 4;

    // 创建一个符合 VectorStoreRetriever 接口的对象
    // VectorStoreRetriever 需要实现 invoke 方法或可以直接调用
    const retriever = {
      invoke: async (query: string) => {
        return await this.search(query, defaultK);
      },
      getRelevantDocuments: async (query: string) => {
        return await this.search(query, defaultK);
      },
    } as any;

    // 使 retriever 可以直接作为函数调用
    const callableRetriever = Object.assign(
      async (query: string) => {
        return await this.search(query, defaultK);
      },
      retriever
    );

    return callableRetriever as VectorStoreRetriever;
  }

  /**
   * 获取索引中的文档数量
   * @returns 文档数量
   */
  getDocumentCount(): number {
    return this.documents.size;
  }

  /**
   * 检查索引是否已初始化
   * @returns 是否已初始化
   */
  isInitialized(): boolean {
    return this.index !== null && this.getDocumentCount() > 0;
  }

  /**
   * 清空索引
   */
  clear(): void {
    this.index = null;
    this.documents.clear();
    this.nextId = 0;
  }
}

// 为了保持向后兼容，导出别名
export const FaissStoreWrapper = HNSWLibStoreWrapper;

