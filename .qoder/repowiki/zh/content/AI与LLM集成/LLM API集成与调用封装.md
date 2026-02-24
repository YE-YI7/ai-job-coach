# LLM API集成与调用封装

<cite>
**本文档引用的文件**  
- [lib/llm.ts](file://lib/llm.ts)
- [app/api/chat/route.ts](file://app/api/chat/route.ts)
- [app/api/interview/start/route.ts](file://app/api/interview/start/route.ts)
- [app/api/interview/answer/route.ts](file://app/api/interview/answer/route.ts)
- [lib/interview/llm.ts](file://lib/interview/llm.ts)
- [lib/interview/types.ts](file://lib/interview/types.ts)
- [.env.example](file://.env.example)
</cite>

## 目录
1. [引言](#引言)
2. [核心封装机制](#核心封装机制)
3. [多提供商支持与动态配置](#多提供商支持与动态配置)
4. [超时控制与重试机制](#超时控制与重试机制)
5. [错误处理策略](#错误处理策略)
6. [LLM_STUB模式设计](#llm_stub模式设计)
7. [调用示例与API集成](#调用示例与api集成)
8. [配置建议与系统影响](#配置建议与系统影响)

## 引言
本项目通过`lib/llm.ts`文件实现了对大型语言模型（LLM）调用的统一封装，为应用提供稳定、可靠且可扩展的AI能力支持。该封装机制不仅支持OpenAI和DeepSeek两个主流提供商，还集成了超时控制、指数退避重试、错误分类处理以及开发调试模式等关键功能，有效应对网络不稳定、认证失败、配额不足等常见问题，确保系统在各种异常场景下的容错能力和用户体验。

## 核心封装机制
`lib/llm.ts`文件中的核心是`callLLM`函数，它作为统一的LLM调用入口，封装了所有与AI模型交互的复杂逻辑。该函数接收消息数组和可选配置参数，返回AI生成的文本回复。其设计遵循分层架构原则，将不同职责分离到多个函数中：
- `callLLM`：主函数，负责参数验证、环境检查、客户端初始化和结果处理。
- `callWithTimeoutAndRetry`：高阶函数，提供超时和重试能力。
- `clientCall`：内部包装函数，执行实际的SDK调用。

这种分层设计使得代码结构清晰，职责分明，便于维护和扩展。

**节来源**
- [lib/llm.ts](file://lib/llm.ts#L81-L162)

## 多提供商支持与动态配置
`callLLM`函数通过动态配置实现了对OpenAI和DeepSeek两个提供商的统一支持。其核心机制如下：

### 动态API Key读取
函数根据`options.provider`参数（默认为"deepseek"）决定使用哪个提供商，并从环境变量中读取对应的API Key：
- 当提供商为"deepseek"时，读取`DEEPSEEK_API_KEY`环境变量。
- 当提供商为"openai"时，读取`OPENAI_API_KEY`环境变量。

如果未找到相应的API Key，函数会抛出明确的错误信息，提示开发者检查环境变量配置。

### 动态baseURL配置
对于DeepSeek提供商，函数通过`baseURL`参数显式设置API端点为`https://api.deepseek.com`。而OpenAI则使用SDK默认的baseURL，无需额外配置。这种设计使得应用可以无缝切换不同的LLM提供商，而无需修改大量代码。

**节来源**
- [lib/llm.ts](file://lib/llm.ts#L107-L122)
- [.env.example](file://.env.example#L8)

## 超时控制与重试机制
`callWithTimeoutAndRetry`函数是整个封装机制的容错核心，它通过`Promise.race`和`setTimeout`实现了精确的超时控制，并结合指数退避算法实现了智能重试。

### 超时控制
函数利用`Promise.race`并行执行两个Promise：
1. 实际的LLM调用Promise。
2. 一个由`setTimeoutPromise`创建的延迟Promise，超时后会抛出"LLM_REQUEST_TIMEOUT"错误。

当任何一个Promise先完成，`Promise.race`就会返回其结果。如果超时Promise先完成，则整个调用被视为超时，从而避免了长时间的无响应。

### 指数退避重试
在发生网络错误或超时后，函数会进行重试。重试间隔采用指数退避策略：`backoff = 500 * attempt`，即第一次重试等待500ms，第二次等待1000ms，以此类推。这种策略可以有效缓解服务端的瞬时压力，避免因密集重试导致雪崩效应。

**节来源**
- [lib/llm.ts](file://lib/llm.ts#L12-L73)

## 错误处理策略
封装机制对错误进行了精细化的分类处理，确保不同类型的错误得到恰当的响应。

### 关键错误精准捕获
函数通过检查错误对象的`message`、`code`和`statusCode`等属性，精准识别出以下关键错误：
- **认证失败（401）**：当错误信息包含"Authentication"、"401"或错误码为"invalid_api_key"时，立即终止重试并抛出友好提示。
- **配额不足（insufficient_quota）**：当错误码为"insufficient_quota"时，同样终止重试，并提示用户检查账户余额。

### 友好提示策略
在`callLLM`函数的最终`catch`块中，对不同类型的错误进行了友好的中文提示转换：
- `insufficient_quota` -> "API 配额不足，请检查账户余额"
- `invalid_api_key` -> "API Key 无效，请检查环境变量配置"
- 超时错误 -> "LLM API 调用失败: Request timed out."

这种策略避免了将晦涩的技术错误直接暴露给用户，提升了用户体验。

**节来源**
- [lib/llm.ts](file://lib/llm.ts#L37-L51)
- [lib/llm.ts](file://lib/llm.ts#L150-L158)

## LLM_STUB模式设计
LLM_STUB模式是一种开发调试模式，旨在提高开发效率和降低调试成本。

### 设计用途
当环境变量`LLM_STUB`被设置为"1"时，系统会跳过所有真实的LLM调用，直接返回预设的模拟响应（如"Hello! 👋 How can I help you today?"）。这使得开发者可以在没有网络连接或API Key的情况下进行前端开发和功能测试，同时避免了产生不必要的API调用费用。

### 实现方式
该模式在`callLLM`函数的最开始就被检查，优先级高于API Key验证。一旦启用，函数会立即返回mock响应，不执行后续的任何真实请求逻辑。此外，`lib/interview/llm.ts`中的`generateInterviewQuestions`等函数也继承了这一模式，在LLM调用失败时会自动降级到stub模式，确保核心功能不中断。

**节来源**
- [lib/llm.ts](file://lib/llm.ts#L98-L105)
- [lib/interview/llm.ts](file://lib/interview/llm.ts#L253-L258)

## 调用示例与API集成
`callLLM`函数在多个API路由中被广泛使用，展示了其灵活的集成方式。

### 在聊天API中的使用
`app/api/chat/route.ts`文件中的POST处理器是`callLLM`的典型用例。它首先进行用户认证，然后解析请求体中的消息数组，根据`stage`参数选择合适的系统提示词（system prompt），最后调用`callLLM`并返回AI回复。此过程展示了如何将`messages`、`model`等参数传递给`callLLM`。

### 在面试模块中的使用
`app/api/interview/start/route.ts`和`app/api/interview/answer/route.ts`文件展示了更复杂的集成。它们不仅调用`callLLM`，还结合了数据库操作和业务逻辑。例如，`start`路由在生成面试题后会将其保存到数据库，而`answer`路由则会评估用户的回答并保存评估结果。

**节来源**
- [app/api/chat/route.ts](file://app/api/chat/route.ts#L222)
- [app/api/interview/start/route.ts](file://app/api/interview/start/route.ts#L129)
- [app/api/interview/answer/route.ts](file://app/api/interview/answer/route.ts#L150)

## 配置建议与系统影响
合理的配置对用户体验和系统稳定性至关重要。

### 超时时间（timeoutMs）
建议将`timeoutMs`设置为10000ms（10秒）。过短的超时会导致在正常网络波动下频繁超时，而过长的超时则会让用户长时间等待，影响体验。对于生成复杂内容的场景（如生成多个面试题），可以适当延长至60秒。

### 重试次数（maxRetries）
建议将`maxRetries`设置为2次。一次重试可以有效应对瞬时网络抖动，而两次重试则提供了更高的容错率。超过2次的重试通常意义不大，反而会增加用户等待时间。

这些配置在`lib/llm.ts`中都有默认值，开发者可以根据实际部署环境进行调整，以在稳定性、性能和用户体验之间取得最佳平衡。

**节来源**
- [lib/llm.ts](file://lib/llm.ts#L16-L17)
- [lib/llm.ts](file://lib/llm.ts#L137-L138)