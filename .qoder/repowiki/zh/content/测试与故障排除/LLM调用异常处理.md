# LLM调用异常处理

<cite>
**本文档引用的文件**   
- [INTERVIEW_LLM_FIX_SUMMARY.md](file://INTERVIEW_LLM_FIX_SUMMARY.md)
- [lib/interview/llm.ts](file://lib/interview/llm.ts)
- [app/api/interview/start/route.ts](file://app/api/interview/start/route.ts)
- [app/api/interview/answer/route.ts](file://app/api/interview/answer/route.ts)
- [app/api/interview/complete/route.ts](file://app/api/interview/complete/route.ts)
- [app/api/interview/summary/route.ts](file://app/api/interview/summary/route.ts)
- [lib/llm.ts](file://lib/llm.ts)
- [.env.example](file://.env.example)
</cite>

## 目录
1. [引言](#引言)
2. [面试API路由的运行时配置](#面试api路由的运行时配置)
3. [LLM调用机制与API密钥逻辑](#llm调用机制与api密钥逻辑)
4. [超时与重试机制配置](#超时与重试机制配置)
5. [环境变量与API密钥检查](#环境变量与api密钥检查)
6. [网络与API连接问题排查](#网络与api连接问题排查)
7. [LLM调用测试步骤](#llm调用测试步骤)
8. [结论](#结论)

## 引言
本文档旨在深入分析LLM调用失败的常见原因及解决方案。基于项目中的`INTERVIEW_LLM_FIX_SUMMARY.md`文档，我们将详细说明如何确保面试相关API路由正确配置以避免Edge Runtime限制，解析`lib/interview/llm.ts`中的API Key选择逻辑，以及提供超时与重试机制的配置细节。同时，本文将指导开发者检查环境变量加载情况、网络连通性及API密钥有效性，并列出测试LLM调用的完整步骤。

**Section sources**
- [INTERVIEW_LLM_FIX_SUMMARY.md](file://INTERVIEW_LLM_FIX_SUMMARY.md)

## 面试API路由的运行时配置
在Next.js应用中，API路由默认运行在Edge Runtime上，这可能会导致某些Node.js特定功能不可用。为了确保面试相关的API路由能够正确调用LLM服务，必须显式声明使用Node.js运行时。

### 必须显式声明的运行时配置
根据`INTERVIEW_LLM_FIX_SUMMARY.md`文档，所有面试相关的API路由文件顶部必须添加以下代码：
```typescript
export const runtime = "nodejs";
```

### 已配置的API路由示例
以下文件已经正确配置了运行时设置：

- **开始面试路由** (`app/api/interview/start/route.ts`)
  ```typescript
  export const runtime = "nodejs";
  export const preferredRegion = "auto";
  ```

- **回答问题路由** (`app/api/interview/answer/route.ts`)
  ```typescript
  export const runtime = "nodejs";
  export const preferredRegion = "auto";
  ```

- **完成面试路由** (`app/api/interview/complete/route.ts`)
  ```typescript
  export const runtime = "nodejs";
  export const preferredRegion = "auto";
  ```

- **获取面试总结路由** (`app/api/interview/summary/route.ts`)
  ```typescript
  export const runtime = "nodejs";
  ```

### 配置说明
- `runtime = "nodejs"`：强制API路由在Node.js环境中运行，避免Edge Runtime的限制。
- `preferredRegion = "auto"`：（可选）指定首选区域，有助于优化性能。

**Section sources**
- [app/api/interview/start/route.ts](file://app/api/interview/start/route.ts#L19-L21)
- [app/api/interview/answer/route.ts](file://app/api/interview/answer/route.ts#L19-L21)
- [app/api/interview/complete/route.ts](file://app/api/interview/complete/route.ts#L22-L24)
- [app/api/interview/summary/route.ts](file://app/api/interview/summary/route.ts#L18)

## LLM调用机制与API密钥逻辑
LLM调用的核心逻辑位于`lib/interview/llm.ts`文件中，该文件封装了生成面试题、评估答案和生成面试总结的功能。其API密钥选择逻辑是确保服务正常运行的关键。

### API密钥选择优先级
根据`lib/llm.ts`文件中的实现，API密钥的选择遵循以下优先级：
1. **优先使用DEEPSEEK_API_KEY**：如果环境变量`DEEPSEEK_API_KEY`已设置，则使用DeepSeek作为LLM提供商。
2. **其次使用OPENAI_API_KEY**：如果`DEEPSEEK_API_KEY`未设置但`OPENAI_API_KEY`已设置，则使用OpenAI作为提供商。
3. **降级至stub模式**：如果两个API密钥均未设置，或者显式设置了`LLM_STUB=1`，则系统将降级到stub模式，返回预定义的模拟数据。

### 代码逻辑分析
在`lib/llm.ts`中，`callLLM`函数负责调用LLM服务。其核心逻辑如下：
```typescript
const provider = options?.provider || "deepseek";
const apiKey = provider === "deepseek" 
  ? process.env.DEEPSEEK_API_KEY 
  : process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error(`${provider.toUpperCase()}_API_KEY not found in environment variables`);
}
```

### Stub模式
当系统处于stub模式时，所有LLM调用将返回预定义的模拟数据，这对于开发和测试非常有用。可以通过设置环境变量`LLM_STUB=1`来强制启用stub模式。

**Section sources**
- [lib/interview/llm.ts](file://lib/interview/llm.ts#L253-L258)
- [lib/llm.ts](file://lib/llm.ts#L107-L114)

## 超时与重试机制配置
为了确保LLM调用的稳定性和可靠性，系统配置了合理的超时和重试机制。这些配置在`lib/interview/llm.ts`文件中定义。

### 超时与重试配置详情
- **生成面试题** (`generateInterviewQuestions`)
  - **超时时间**：30秒
  - **最大重试次数**：2次
- **评估答案** (`evaluateAnswer`)
  - **超时时间**：20秒
  - **最大重试次数**：2次
- **生成面试总结** (`summarizeInterview`)
  - **超时时间**：20秒
  - **最大重试次数**：2次

### 配置代码示例
在`lib/interview/llm.ts`中，这些配置通过`callLLM`函数的选项参数传递：
```typescript
const response = await callLLM(
  [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ],
  {
    model: process.env.LLM_MODEL_CHAT,
    temperature: 0.7,
    maxTokens: 2000,
    timeoutMs: 60000, // 60秒超时
    maxRetries: 2,
  }
);
```

### 重试策略
系统采用指数退避策略进行重试，每次重试的等待时间逐渐增加，以减少对LLM服务的压力。

**Section sources**
- [lib/interview/llm.ts](file://lib/interview/llm.ts#L314-L316)
- [lib/interview/llm.ts](file://lib/interview/llm.ts#L555-L557)
- [lib/interview/llm.ts](file://lib/interview/llm.ts#L761-L763)

## 环境变量与API密钥检查
正确的环境变量配置是LLM调用成功的基础。开发者需要确保相关环境变量已正确设置并加载。

### 检查方法
1. **确认环境变量文件**：检查项目根目录下的`.env.local`或`.env`文件，确保包含以下任一API密钥：
   ```bash
   # .env.local
   DEEPSEEK_API_KEY=sk-xxxxx
   # 或
   OPENAI_API_KEY=sk-xxxxx
   ```
2. **重启开发服务器**：在修改环境变量后，必须重启开发服务器以确保新配置生效。
3. **检查日志输出**：在服务器启动时，检查控制台日志，确认环境变量已正确加载。

### 环境变量示例
项目提供了`.env.example`文件作为参考，开发者应将其复制为`.env.local`并填入真实值：
```
# DeepSeek API Key（服务器端使用）
DEEPSEEK_API_KEY=your-api-key-here
```

**Section sources**
- [.env.example](file://.env.example#L8)
- [INTERVIEW_LLM_FIX_SUMMARY.md](file://INTERVIEW_LLM_FIX_SUMMARY.md#L50-L59)

## 网络与API连接问题排查
即使环境变量配置正确，网络问题或API密钥无效也可能导致LLM调用失败。以下是排查这些问题的步骤。

### 检查方法
1. **查看服务器日志**：检查服务器控制台日志，寻找具体的错误信息，如认证失败、请求超时等。
2. **验证API密钥有效性**：确保使用的API密钥是有效的，并且账户有足够的配额。
3. **检查网络连接**：确保服务器能够正常访问外部网络，特别是能够连接到DeepSeek或OpenAI的服务端点。

### 常见错误及解决方案
- **认证失败**：错误信息通常包含"Authentication"或"401"，表示API密钥无效。解决方案是检查环境变量中的API密钥是否正确。
- **请求超时**：错误信息包含"timeout"或"LLM_REQUEST_TIMEOUT"，表示请求在规定时间内未完成。可以尝试增加超时时间或检查网络状况。
- **配额不足**：错误信息包含"insufficient_quota"，表示账户配额已用尽。需要检查账户余额并充值。

**Section sources**
- [INTERVIEW_LLM_FIX_SUMMARY.md](file://INTERVIEW_LLM_FIX_SUMMARY.md#L65-L68)
- [lib/llm.ts](file://lib/llm.ts#L151-L158)

## LLM调用测试步骤
为了确保LLM调用功能正常工作，开发者应按照以下步骤进行测试。

### 测试步骤
1. **重启开发服务器**：
   ```bash
   npm run dev
   ```
2. **检查环境变量**：确认`.env.local`文件中已正确设置`DEEPSEEK_API_KEY`或`OPENAI_API_KEY`。
3. **测试生成面试题**：
   - 进入`/interview/start`页面。
   - 填写职位描述、面试轮次类型和题目数量。
   - 点击"开始面试"按钮。
   - 检查是否生成了真实的LLM题目，而不是stub模式下的模拟数据。
4. **测试评估答案**：
   - 在面试过程中提交一个答案。
   - 检查返回的评估结果是否详细且合理。
5. **检查服务器日志**：
   - 查看服务器控制台日志，确认没有错误信息。
   - 如果有错误，记录具体的错误信息以便进一步排查。

### 预期结果
- 在非stub模式下，生成的面试题和评估结果应由LLM动态生成，内容丰富且具有针对性。
- 服务器日志中不应出现与LLM调用相关的错误。

**Section sources**
- [INTERVIEW_LLM_FIX_SUMMARY.md](file://INTERVIEW_LLM_FIX_SUMMARY.md#L87-L104)

## 结论
本文档详细分析了LLM调用失败的常见原因及解决方案。通过显式声明`export const runtime = "nodejs"`，可以避免Edge Runtime的限制。API密钥的选择逻辑优先使用`DEEPSEEK_API_KEY`，其次`OPENAI_API_KEY`，若均未设置则降级至stub模式。超时与重试机制的配置确保了服务的稳定性。开发者应检查环境变量加载情况、网络连通性及API密钥有效性，并按照提供的测试步骤验证LLM调用功能。遵循这些指导，可以有效解决LLM调用异常问题，确保面试功能的正常运行。