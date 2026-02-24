# 聊天API

<cite>
**本文档引用的文件**
- [app/api/chat/route.ts](file://app/api/chat/route.ts)
- [app/api/demo-chat/route.ts](file://app/api/demo-chat/route.ts)
- [lib/conversationStore.ts](file://lib/conversationStore.ts)
- [components/ChatFlow.tsx](file://components/ChatFlow.tsx)
- [lib/stage.ts](file://lib/stage.ts)
- [app/api/README.md](file://app/api/README.md)
</cite>

## 目录
1. [简介](#简介)
2. [核心端点](#核心端点)
3. [请求处理逻辑](#请求处理逻辑)
4. [会话状态管理](#会话状态管理)
5. [前端集成](#前端集成)
6. [调试技巧](#调试技巧)

## 简介
聊天API是AI求职教练应用的核心功能，提供两个主要端点：`/api/chat`用于生产环境的真实AI对话，`/api/demo-chat`用于演示和测试。该API根据用户所处的求职阶段（如职业规划、简历优化等）提供定制化的AI回复，并通过会话管理保持上下文连贯性。

## 核心端点
### /api/chat (POST)
这是主要的聊天API端点，用于处理真实的AI对话请求。它集成了完整的AI编排器和LLM调用，根据用户当前的求职阶段提供专业指导。

**请求示例**：
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "我想转行做产品经理"
      }
    ],
    "stage": "career_planning"
  }'
```

**响应结构**：
```json
{
  "ok": true,
  "result": "很好！产品经理是一个很有前景的职业..."
}
```

### /api/demo-chat (POST)
这是一个演示用的聊天API端点，返回模拟的AI回复，不调用真实的LLM服务。主要用于快速测试和演示。

**请求示例**：
```bash
curl -X POST http://localhost:3000/api/demo-chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好"
  }'
```

**响应结构**：
```json
{
  "ok": true,
  "result": "您好！您发送了消息: \"你好\"。这是一个模拟的聊天回复...",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "note": "This is a demo response. Use /api/chat for production."
}
```

**Section sources**
- [app/api/chat/route.ts](file://app/api/chat/route.ts)
- [app/api/demo-chat/route.ts](file://app/api/demo-chat/route.ts)

## 请求处理逻辑
### 输入格式
POST请求的请求体应包含以下字段：

**消息输入格式**：
```json
{
  "messages": [
    {
      "role": "user",
      "content": "用户输入的消息内容"
    }
  ],
  "stage": "当前用户所处的求职阶段"
}
```

其中，`stage`字段的可能值包括：
- `career_planning` - 职业规划
- `project_review` - 项目梳理
- `resume_optimization` - 简历优化
- `application_strategy` - 投递策略
- `interview` - 模拟面试
- `salary_talk` - 薪资沟通
- `offer` - Offer选择

### 系统提示词管理
API根据`stage`参数动态选择相应的系统提示词（System Prompt），为AI设定不同的角色和行为准则。例如，当`stage`为`career_planning`时，AI会以职业咨询师的身份进行对话；当`stage`为`resume_optimization`时，AI会以简历优化师的身份提供指导。

每个阶段的系统提示词都包含详细的指令，包括：
- 对话风格要求（如使用短句、语气亲切等）
- 内容生成规则（如每次只聚焦一个核心问题）
- 禁止行为（如禁止使用客服腔调）
- 表情符号使用建议

### 响应处理
API的响应结构如下：
```json
{
  "ok": true,
  "result": "AI的回复内容"
}
```

对于`/api/demo-chat`端点，还会包含时间戳和备注信息：
```json
{
  "ok": true,
  "result": "模拟回复内容",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "note": "This is a demo response."
}
```

**Section sources**
- [app/api/chat/route.ts](file://app/api/chat/route.ts#L8-L143)
- [app/api/demo-chat/route.ts](file://app/api/demo-chat/route.ts#L36-L47)

## 会话状态管理
### 会话存储机制
会话状态通过`conversationStore.ts`文件中的`conversationStore`单例进行管理。该存储器为每个用户维护独立的对话历史，并按求职阶段进行组织。

**ConversationMessage类型定义**：
```typescript
type ConversationMessage = {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: number;
  stage: UserStage;
};
```

**StageConversations结构**：
```typescript
type StageConversations = {
  [stage in UserStage]: ConversationMessage[];
};
```

### 本地存储集成
对话历史会持久化存储在浏览器的`localStorage`中，键名为`conversationStore_${userId}`。当用户切换时，系统会自动加载该用户的对话历史；当用户登出时，会清空相关数据。

**存储操作**：
- `saveToLocalStorage(userId)`: 将当前对话历史保存到localStorage
- `loadFromLocalStorage(userId)`: 从localStorage加载指定用户的对话历史
- `clearUserData(userId)`: 清除指定用户的对话历史

### 上下文构建
在调用LLM之前，API会从`conversationStore`中获取相关阶段的对话历史，并将其转换为LLM可以理解的格式：

```typescript
getAllHistoryForStage(currentStage: UserStage): Array<{
  role: "user" | "assistant";
  content: string;
  stage?: UserStage;
}>
```

此方法会按求职流程顺序整合所有阶段的对话历史，并在阶段切换时添加分隔标记，帮助AI理解上下文。

**Section sources**
- [lib/conversationStore.ts](file://lib/conversationStore.ts)
- [lib/stage.ts](file://lib/stage.ts)

## 前端集成
### ChatFlow组件
前端通过`ChatFlow.tsx`组件与聊天API进行交互。该组件提供了完整的聊天界面，包括消息显示区域和输入栏。

**关键属性**：
```typescript
interface ChatFlowProps {
  messages: Message[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isLoading?: boolean;
  userStage?: string;
}
```

### 实际调用示例
前端通过`fetch` API调用聊天接口：

```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [
      {
        role: "user",
        content: userInput
      }
    ],
    stage: currentStage
  })
});
const data = await response.json();
```

### 用户体验特性
- **自动滚动**：新消息出现时，聊天窗口会自动滚动到底部
- **输入调整**：文本输入框会根据内容自动调整高度
- **快捷发送**：按下Enter键（非Shift+Enter）可快速发送消息
- **加载状态**：在等待AI回复时显示加载动画

**Section sources**
- [components/ChatFlow.tsx](file://components/ChatFlow.tsx)
- [app/api/README.md](file://app/api/README.md#L178-L194)

## 调试技巧
### 日志输出位置
- **API错误日志**：在`app/api/chat/route.ts`和`app/api/demo-chat/route.ts`中使用`console.error`输出错误信息
- **会话存储日志**：在`lib/conversationStore.ts`中记录存储操作的错误
- **网络请求日志**：在浏览器开发者工具的Network标签中查看API请求详情

### 常见问题及解决方案
#### 401未认证错误
**原因**：用户未登录或会话过期
**解决方案**：
1. 确保用户已成功登录
2. 检查认证令牌是否有效
3. 重新登录以获取新的会话

#### 400请求错误
**原因**：请求体格式不正确
**解决方案**：
1. 确保请求体是有效的JSON格式
2. 检查`messages`字段是否为数组
3. 确认每个消息对象包含`role`和`content`字段

#### 500服务器错误
**原因**：服务器内部错误
**解决方案**：
1. 检查服务器日志中的详细错误信息
2. 确认LLM服务是否正常运行
3. 验证环境变量配置是否正确

#### 超时问题
**常见原因**：
- LLM响应时间过长
- 网络连接不稳定
- 服务器负载过高

**解决方案**：
1. **增加超时时间**：在前端设置更长的fetch超时
2. **实现重试机制**：对失败的请求进行有限次数的重试
3. **优化LLM调用**：简化系统提示词或减少上下文长度
4. **使用流式响应**：考虑实现TransformStream以提供渐进式响应
5. **监控性能**：记录API响应时间，识别性能瓶颈

**调试建议**：
- 使用`/api/demo-chat`端点快速验证前端逻辑
- 在开发环境中启用详细的日志记录
- 使用Postman或curl直接测试API端点
- 检查浏览器控制台中的JavaScript错误

**Section sources**
- [app/api/chat/route.ts](file://app/api/chat/route.ts#L230-L235)
- [app/api/demo-chat/route.ts](file://app/api/demo-chat/route.ts#L57-L62)
- [lib/conversationStore.ts](file://lib/conversationStore.ts#L177-L192)