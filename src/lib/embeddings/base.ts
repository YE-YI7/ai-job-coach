// LangChain 已移除，以下导入已注释
// import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
// import type { Embeddings } from "@langchain/core/embeddings";
// import type { Document } from "@langchain/core/documents";

// 临时类型定义（用于兼容）
type Embeddings = any;
type Document = any;

/**
 * Embedding Provider 类
 * 使用 HuggingFace Embeddings 提供文本嵌入功能
 * 兼容 LangChain 文档加载器
 * 
 * 注意：LangChain 已移除，此类仅用于脚本，不会在应用代码中使用
 */
export class EmbeddingProvider {
  private embeddings: any; // HuggingFaceTransformersEmbeddings;

  /**
   * 构造函数
   * @param modelName HuggingFace 模型名称，默认为 BAAI/bge-small-zh-v1.5
   * @param options 额外的配置选项
   */
  constructor(
    modelName: string = "BAAI/bge-small-zh-v1.5",
    options?: {
      timeout?: number;
      batchSize?: number;
      stripNewLines?: boolean;
    }
  ) {
    // LangChain 已移除，此实现已禁用
    // 仅在 scripts/ingest.ts 中使用，不会影响应用构建
    throw new Error("EmbeddingProvider 已禁用：LangChain 依赖已移除。此功能仅在本地脚本中使用。");
    // this.embeddings = new HuggingFaceTransformersEmbeddings({
    //   model: modelName,
    //   ...(options?.timeout && { timeout: options.timeout }),
    //   ...(options?.batchSize && { batchSize: options.batchSize }),
    //   ...(options?.stripNewLines !== undefined && { stripNewLines: options.stripNewLines }),
    // });
  }

  /**
   * 嵌入单个文本
   * @param text 要嵌入的文本
   * @returns 嵌入向量（number[]）
   */
  async embedText(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error("文本不能为空");
    }

    try {
      return await this.embeddings.embedQuery(text);
    } catch (error) {
      console.error("嵌入文本失败:", error);
      throw new Error(`嵌入文本失败: ${error instanceof Error ? error.message : "未知错误"}`);
    }
  }

  /**
   * 嵌入多个文档
   * @param texts 要嵌入的文本数组
   * @returns 嵌入向量数组（number[][]）
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      throw new Error("文本数组不能为空");
    }

    // 过滤空文本
    const validTexts = texts.filter((text) => text && text.trim().length > 0);

    if (validTexts.length === 0) {
      throw new Error("没有有效的文本可以嵌入");
    }

    try {
      return await this.embeddings.embedDocuments(validTexts);
    } catch (error) {
      console.error("嵌入文档失败:", error);
      throw new Error(`嵌入文档失败: ${error instanceof Error ? error.message : "未知错误"}`);
    }
  }

  /**
   * 嵌入 LangChain Document 对象
   * @param documents LangChain Document 数组
   * @returns 嵌入向量数组（number[][]）
   */
  async embedLangChainDocuments(documents: Document[]): Promise<number[][]> {
    if (!documents || documents.length === 0) {
      throw new Error("文档数组不能为空");
    }

    // 提取文档内容
    const texts = documents.map((doc) => doc.pageContent);

    return this.embedDocuments(texts);
  }

  /**
   * 获取底层的 LangChain Embeddings 实例
   * 用于直接与 LangChain 生态集成
   * @returns LangChain Embeddings 实例
   */
  getLangChainEmbeddings(): Embeddings {
    return this.embeddings;
  }

  /**
   * 获取当前使用的模型名称
   * @returns 模型名称
   */
  getModelName(): string {
    return this.embeddings.model || "BAAI/bge-small-zh-v1.5";
  }
}

