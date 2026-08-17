import OpenAI from "openai";
// LangChain 已移除，以下类型导入已注释
// import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
// import type { BaseMessage } from "@langchain/core/messages";

// 临时类型定义（用于兼容）
type BaseChatModel = any;
type BaseMessage = any;

/**
 * 支持的模型类型
 */
export type ModelType = "deepseek" | "openai" | "qwen";

/**
 * LLM 调用参数
 */
export interface LLMCallParams {
  system?: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  temperature?: number;
  tools?: any[];
  maxTokens?: number;
}

/**
 * LLM 流式响应类型
 */
export type StreamChunk = {
  content: string;
  done: boolean;
};

/**
 * LLM Provider 类
 * 统一管理不同 LLM 提供商的调用
 */
export class LLMProvider {
  private modelType: ModelType;
  private client: OpenAI | null = null;
  private langchainModel: BaseChatModel | null = null;

  constructor(modelType?: ModelType) {
    // 从环境变量读取模型类型，如果没有指定则使用 deepseek 作为默认值
    this.modelType = modelType || (process.env.LLM_MODEL_TYPE as ModelType) || "deepseek";

    if (!["deepseek", "openai", "qwen"].includes(this.modelType)) {
      throw new Error(`不支持的模型类型: ${this.modelType}。支持的类型: deepseek, openai, qwen`);
    }

    this.initializeClient();
  }

  /**
   * 初始化客户端
   */
  private initializeClient(): void {
    try {
      // 优先尝试使用 LangChain 包装器
      this.langchainModel = this.createLangChainModel();
      if (this.langchainModel) {
        return;
      }
    } catch (error) {
      console.warn("LangChain 模型初始化失败，使用 OpenAI SDK 兼容模式:", error);
    }

    // 回退到 OpenAI SDK 兼容模式
    this.client = this.createOpenAIClient();
  }

  /**
   * 创建 LangChain 模型实例
   */
  private createLangChainModel(): BaseChatModel | null {
    try {
      switch (this.modelType) {
        case "openai": {
          // 尝试使用 @langchain/openai
          const { ChatOpenAI } = require("@langchain/openai");
          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) {
            throw new Error("OPENAI_API_KEY 未设置");
          }
          return new ChatOpenAI({
            openAIApiKey: apiKey,
            modelName: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
            temperature: 0.7, // 默认 temperature
          });
        }
        case "deepseek": {
          // 尝试使用 @langchain/community 中的 ChatOpenAI（兼容 DeepSeek）
          // 或者使用 OpenAI SDK 兼容模式
          const apiKey = process.env.DEEPSEEK_API_KEY;
          if (!apiKey) {
            throw new Error("DEEPSEEK_API_KEY 未设置");
          }
          // DeepSeek 可以使用 ChatOpenAI 配置 baseURL
          const { ChatOpenAI } = require("@langchain/openai");
          return new ChatOpenAI({
            openAIApiKey: apiKey,
            configuration: {
              baseURL: "https://api.deepseek.com",
            },
            modelName: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
            temperature: 0.7, // 默认 temperature
          });
        }
        case "qwen": {
          // 尝试使用 @langchain/tongyi（如果已安装）
          try {
            const { ChatTongyi } = require("@langchain/tongyi");
            const apiKey = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY;
            if (!apiKey) {
              throw new Error("DASHSCOPE_API_KEY 或 QWEN_API_KEY 未设置");
            }
            return new ChatTongyi({
              dashScopeApiKey: apiKey,
              modelName: process.env.QWEN_MODEL || "qwen-turbo",
              temperature: 0.7, // 默认 temperature
            });
          } catch {
            // 如果 @langchain/tongyi 未安装，返回 null 使用 OpenAI SDK 兼容模式
            return null;
          }
        }
        default:
          return null;
      }
    } catch (error) {
      console.warn(`LangChain ${this.modelType} 模型初始化失败:`, error);
      return null;
    }
  }

  /**
   * 创建 OpenAI SDK 兼容客户端
   */
  private createOpenAIClient(): OpenAI {
    let apiKey: string;
    let baseURL: string | undefined;

    switch (this.modelType) {
      case "openai": {
        apiKey = process.env.OPENAI_API_KEY || "";
        if (!apiKey) {
          throw new Error("OPENAI_API_KEY 未设置");
        }
        baseURL = undefined; // 使用默认的 OpenAI baseURL
        break;
      }
      case "deepseek": {
        apiKey = process.env.DEEPSEEK_API_KEY || "";
        if (!apiKey) {
          throw new Error("DEEPSEEK_API_KEY 未设置");
        }
        baseURL = "https://api.deepseek.com";
        break;
      }
      case "qwen": {
        apiKey = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || "";
        if (!apiKey) {
          throw new Error("DASHSCOPE_API_KEY 或 QWEN_API_KEY 未设置");
        }
        baseURL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
        break;
      }
      default:
        throw new Error(`不支持的模型类型: ${this.modelType}`);
    }

    return new OpenAI({
      apiKey,
      baseURL,
    });
  }

  /**
   * 获取模型名称
   */
  private getModelName(): string {
    switch (this.modelType) {
      case "openai":
        return process.env.OPENAI_MODEL || "gpt-3.5-turbo";
      case "deepseek":
        return process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
      case "qwen":
        return process.env.QWEN_MODEL || "qwen-turbo";
      default:
        return "gpt-3.5-turbo";
    }
  }

  /**
   * 转换消息格式为 OpenAI 格式
   */
  private formatMessages(params: LLMCallParams): Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> {
    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [];

    if (params.system) {
      messages.push({ role: "system", content: params.system });
    }

    messages.push(...params.messages);

    return messages;
  }

  /**
   * 调用 LLM（非流式）
   */
  async call(params: LLMCallParams): Promise<string> {
    const { temperature = 0.7, maxTokens, tools } = params;
    const messages = this.formatMessages(params);

    // 如果使用 LangChain 模型
    // 注意：LangChain 模型的 temperature 在创建时设置，调用时无法动态修改
    // 如果需要动态 temperature，会回退到 OpenAI SDK
    if (this.langchainModel && Math.abs(temperature - 0.7) < 0.01) {
      try {
        // 转换消息格式为 LangChain 格式
        const { HumanMessage, AIMessage, SystemMessage } = require("@langchain/core/messages");
        const langchainMessages = messages.map((msg) => {
          if (msg.role === "system") {
            return new SystemMessage(msg.content);
          } else if (msg.role === "assistant") {
            return new AIMessage(msg.content);
          } else {
            return new HumanMessage(msg.content);
          }
        });

        // 注意：LangChain 模型的 tools 需要通过 bindTools 方法绑定，这里暂不支持
        // 如果需要使用 tools，请使用 OpenAI SDK 模式
        const response = await this.langchainModel.invoke(langchainMessages);

        return typeof response.content === "string" ? response.content : String(response.content);
      } catch (error) {
        console.warn("LangChain 调用失败，回退到 OpenAI SDK:", error);
        // 回退到 OpenAI SDK
      }
    }

    // 使用 OpenAI SDK
    if (!this.client) {
      this.client = this.createOpenAIClient();
    }

    const completion = await this.client.chat.completions.create({
      model: this.getModelName(),
      messages,
      temperature,
      ...(maxTokens && { max_tokens: maxTokens }),
      ...(tools && { tools }),
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("LLM 返回空响应");
    }

    return content;
  }

  /**
   * 流式调用 LLM
   */
  async *stream(params: LLMCallParams): AsyncGenerator<StreamChunk, void, unknown> {
    const { temperature = 0.7, maxTokens, tools } = params;
    const messages = this.formatMessages(params);

    // 如果使用 LangChain 模型
    // 注意：LangChain 模型的 temperature 在创建时设置，调用时无法动态修改
    // 如果需要动态 temperature，会回退到 OpenAI SDK
    if (this.langchainModel && Math.abs(temperature - 0.7) < 0.01) {
      try {
        const { HumanMessage, AIMessage, SystemMessage } = require("@langchain/core/messages");
        const langchainMessages = messages.map((msg) => {
          if (msg.role === "system") {
            return new SystemMessage(msg.content);
          } else if (msg.role === "assistant") {
            return new AIMessage(msg.content);
          } else {
            return new HumanMessage(msg.content);
          }
        });

        // 注意：LangChain 模型的 tools 需要通过 bindTools 方法绑定，这里暂不支持
        // 如果需要使用 tools，请使用 OpenAI SDK 模式
        const stream = await this.langchainModel.stream(langchainMessages);

        for await (const chunk of stream) {
          const content = typeof chunk.content === "string" ? chunk.content : String(chunk.content);
          yield { content, done: false };
        }

        yield { content: "", done: true };
        return;
      } catch (error) {
        console.warn("LangChain 流式调用失败，回退到 OpenAI SDK:", error);
        // 回退到 OpenAI SDK
      }
    }

    // 使用 OpenAI SDK
    if (!this.client) {
      this.client = this.createOpenAIClient();
    }

    const stream = await this.client.chat.completions.create({
      model: this.getModelName(),
      messages,
      temperature,
      ...(maxTokens && { max_tokens: maxTokens }),
      ...(tools && { tools }),
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        yield { content, done: false };
      }
    }

    yield { content: "", done: true };
  }

  /**
   * 生成嵌入向量（如果模型支持）
   */
  async embed(text: string | string[]): Promise<number[][]> {
    const texts = Array.isArray(text) ? text : [text];

    // 如果使用 LangChain 模型，检查是否支持嵌入
    if (this.langchainModel && "embedQuery" in this.langchainModel) {
      try {
        const embeddings = await Promise.all(
          texts.map((t) => (this.langchainModel as any).embedQuery(t))
        );
        return embeddings;
      } catch (error) {
        console.warn("LangChain 嵌入失败，回退到 OpenAI SDK:", error);
      }
    }

    // 使用 OpenAI SDK 的嵌入 API
    if (!this.client) {
      this.client = this.createOpenAIClient();
    }

    // 检查是否支持嵌入（OpenAI 和 DeepSeek 支持，Qwen 可能不支持）
    if (this.modelType === "qwen") {
      throw new Error("Qwen 模型暂不支持嵌入功能");
    }

    const response = await this.client.embeddings.create({
      model: this.modelType === "openai" ? "text-embedding-ada-002" : "text-embedding-3-small",
      input: texts,
    });

    return response.data.map((item: { embedding: number[] }) => item.embedding);
  }

  /**
   * 获取 LangChain ChatModel 实例（用于兼容 LangChain 生态）
   */
  getLangChainModel(): BaseChatModel | null {
    return this.langchainModel;
  }

  /**
   * 获取当前模型类型
   */
  getModelType(): ModelType {
    return this.modelType;
  }
}
