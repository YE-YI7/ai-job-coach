# API参考文档

<cite>
**本文档引用的文件**  
- [app/api/README.md](file://app/api/README.md)
- [app/api/health/route.ts](file://app/api/health/route.ts)
- [app/api/parse-resume/route.ts](file://app/api/parse-resume/route.ts)
- [app/api/save-whiteboard/route.ts](file://app/api/save-whiteboard/route.ts)
- [app/api/load-session/route.ts](file://app/api/load-session/route.ts)
- [app/api/sms/route.ts](file://app/api/sms/route.ts)
- [app/api/verify/route.ts](file://app/api/verify/route.ts)
- [app/api/invites/check/route.ts](file://app/api/invites/check/route.ts)
- [app/api/invites/redeem/route.ts](file://app/api/invites/redeem/route.ts)
- [app/api/admin/invites/generate/route.ts](file://app/api/admin/invites/generate/route.ts)
- [app/api/stage-greeting/route.ts](file://app/api/stage-greeting/route.ts)
- [docs/interview_api.md](file://docs/interview_api.md)
- [docs/interview_api_debug.md](file://docs/interview_api_debug.md)
- [lib/api-client.ts](file://lib/api-client.ts)
- [lib/auth.ts](file://lib/auth.ts)
</cite>

## 目录
1. [简介](#简介)
2. [认证与安全](#认证与安全)
3. [通用错误响应](#通用错误响应)
4. [API端点详情](#api端点详情)
   - [健康检查](#健康检查)
   - [简历解析](#简历解析)
   - [白板数据保存](#白板数据保存)
   - [会话加载](#会话加载)
   - [短信验证码发送](#短信验证码发送)
   - [短信验证码验证](#短信验证码验证)
   - [邀请码检查](#邀请码检查)
   - [邀请码兑换](#邀请码兑换)
   - [邀请码生成（管理员）](#邀请码生成（管理员）)
   - [阶段问候语生成](#阶段问候语生成)
   - [模拟面试API](#模拟面试api)
5. [客户端调用示例](#客户端调用示例)
6. [API测试工具](#api测试工具)
7. [API版本控制与向后兼容性](#api版本控制与向后兼容性)

## 简介

本API参考文档详细说明了ai-job-coach项目中所有公开的RESTful接口。文档覆盖了核心功能如简历解析、面试模拟、用户认证等。每个API端点都详细说明了HTTP方法、URL参数、请求体结构、响应格式与状态码。

所有API端点均位于`/api`路径下，采用标准的JSON请求和响应格式。系统使用Supabase进行身份验证，大多数需要认证的端点都依赖于会话cookie。

**Section sources**
- [app/api/README.md](file://app/api/README.md)

## 认证与安全

### 认证要求
大多数API端点需要用户认证。系统使用Supabase的基于cookie的身份验证机制：

- **认证方式**：基于会话cookie的认证
- **认证头**：无需手动设置Bearer Token，浏览器会自动携带会话cookie
- **未认证响应**：返回HTTP 401状态码

### 安全措施
- 所有API端点都阻止前端提交LLM密钥（apiKey、key、token）
- 敏感操作（如用户创建）使用Supabase Service Role Key在服务器端执行
- 短信服务使用阿里云API签名机制确保请求安全
- 环境变量用于存储敏感配置（数据库连接、API密钥等）

### 速率限制
当前系统未实现显式的速率限制策略。但以下机制提供了基本的保护：
- 邀请码系统限制了新用户注册
- 短信验证码有有效期和重发间隔
- 数据库操作有连接池限制

**Section sources**
- [lib/auth.ts](file://lib/auth.ts)
- [app/api/invites/redeem/route.ts](file://app/api/invites/redeem/route.ts)
- [app/api/sms/route.ts](file://app/api/sms/route.ts)

## 通用错误响应

所有API端点在发生错误时返回统一的错误响应格式：

```json
{
  "ok": false,
  "error": "错误描述信息"
}
```

或

```json
{
  "success": false,
  "msg": "错误描述信息"
}
```

### 常见HTTP状态码
- `400 Bad Request`：请求参数缺失或格式错误
- `401 Unauthorized`：未认证或会话过期
- `404 Not Found`：请求的资源不存在
- `500 Internal Server Error`：服务器内部错误
- `503 Service Unavailable`：服务不可用（如依赖服务未配置）

**Section sources**
- [app/api/invites/check/route.ts](file://app/api/invites/check/route.ts)
- [app/api/invites/redeem/route.ts](file://app/api/invites/redeem/route.ts)
- [app/api/parse-resume/route.ts](file://app/api/parse-resume/route.ts)

## API端点详情

### 健康检查

#### `GET /api/health`

**功能**：健康检查端点，用于系统监控和部署验证。

**认证要求**：无需认证

**请求示例**：
```bash
curl http://localhost:3000/api/health
```

**响应格式**：
```json
{
  "ok": true
}
```

**响应状态码**：
- `200 OK`：服务正常运行

**Section sources**
- [app/api/health/route.ts](file://app/api/health/route.ts)

### 简历解析

#### `POST /api/parse-resume`

**功能**：解析上传的PDF简历文件，提取结构化信息。

**认证要求**：无需认证

**请求体（multipart/form-data）**：
- `file`：PDF格式的简历文件

**请求示例**：
```bash
curl -X POST http://localhost:3000/api/parse-resume \
  -F "file=@resume.pdf"
```

**成功响应格式**：
```json
{
  "ok": true,
  "rawText": "从PDF提取的原始文本",
  "parsed": {
    "summary": "个人简介",
    "skills": ["技能1", "技能2"],
    "education": [
      {
        "school": "学校名称",
        "degree": "学历",
        "time": "时间",
        "text": "详细描述"
      }
    ],
    "experiences": [
      {
        "company": "公司名称",
        "title": "职位",
        "time": "时间",
        "text": "工作描述"
      }
    ],
    "projects": [
      {
        "title": "项目名称",
        "role": "角色",
        "start": "开始时间",
        "end": "结束时间",
        "text": "项目描述"
      }
    ]
  }
}
```

**错误响应**：
- `400 Bad Request`：缺少文件或文件格式不支持
- `500 Internal Server Error`：服务器处理失败
- `503 Service Unavailable`：PDF解析依赖未安装

**Section sources**
- [app/api/parse-resume/route.ts](file://app/api/parse-resume/route.ts)

### 白板数据保存

#### `POST /api/save-whiteboard`

**功能**：保存用户的白板数据到数据库。

**认证要求**：需要认证

**请求体**：
```json
{
  "data": "要保存的白板数据对象"
}
```

**请求示例**：
```bash
curl -X POST http://localhost:3000/api/save-whiteboard \
  -H "Content-Type: application/json" \
  -d '{"data": {"key": "value"}}'
```

**成功响应格式**：
```json
{
  "ok": true
}
```

**错误响应**：
- `400 Bad Request`：data字段缺失
- `401 Unauthorized`：未认证
- `500 Internal Server Error`：数据库操作失败

**Section sources**
- [app/api/save-whiteboard/route.ts](file://app/api/save-whiteboard/route.ts)

### 会话加载

#### `POST /api/load-session`

**功能**：加载用户会话数据。

**认证要求**：需要认证

**请求体**：
```json
{
  "userId": "用户ID",
  "sessionId": "会话ID"
}
```

或

```json
{
  "phone": "手机号",
  "email": "邮箱"
}
```

**成功响应格式**：
```json
{
  "ok": true,
  "user": {
    "id": "用户ID",
    "email": "邮箱"
  }
}
```

**错误响应**：
- `401 Unauthorized`：未认证
- `500 Internal Server Error`：内部错误

**Section sources**
- [app/api/load-session/route.ts](file://app/api/load-session/route.ts)

### 短信验证码发送

#### `POST /api/sms`

**功能**：向指定手机号发送短信验证码。

**认证要求**：无需认证

**请求体**：
```json
{
  "phone": "手机号"
}
```

**成功响应格式**：
```json
{
  "success": true,
  "code": "验证码（仅在开发环境返回）",
  "response": "阿里云API响应"
}
```

**错误响应**：
- `400 Bad Request`：手机号为空
- `500 Internal Server Error`：短信服务配置缺失
- `500 Internal Server Error`：短信发送失败

**环境变量要求**：
- `ALIYUN_ACCESS_KEY_ID`
- `ALIYUN_ACCESS_KEY_SECRET`
- `ALIYUN_SMS_SIGN_NAME`
- `ALIYUN_SMS_TEMPLATE_CODE`

**Section sources**
- [app/api/sms/route.ts](file://app/api/sms/route.ts)

### 短信验证码验证

#### `POST /api/verify`

**功能**：验证手机号和验证码的匹配性。

**认证要求**：无需认证

**请求体**：
```json
{
  "phone": "手机号",
  "code": "验证码"
}
```

**成功响应格式**：
```json
{
  "success": true
}
```

**错误响应格式**：
```json
{
  "success": false,
  "msg": "错误信息"
}
```

**Section sources**
- [app/api/verify/route.ts](file://app/api/verify/route.ts)

### 邀请码检查

#### `GET /api/invites/check`

**功能**：检查邀请码的状态。

**认证要求**：无需认证

**URL参数**：
- `code`：要检查的邀请码

**请求示例**：
```bash
curl "http://localhost:3000/api/invites/check?code=ABC12345"
```

#### `POST /api/invites/check`

**请求体**：
```json
{
  "code": "邀请码"
}
```

**成功响应格式**：
```json
{
  "ok": true,
  "status": "valid|remaining|expired|redeemed|invalid",
  "code": "邀请码",
  "message": "状态描述",
  "data": {
    "created_at": "创建时间",
    "expires_at": "过期时间",
    "used": "是否已使用",
    "uses_count": "已使用次数",
    "max_uses": "最大使用次数"
  }
}
```

**状态说明**：
- `valid`：有效
- `remaining`：有效但剩余次数较少（≤1）
- `expired`：已过期
- `redeemed`：已被使用/已用完
- `invalid`：不存在

**Section sources**
- [app/api/invites/check/route.ts](file://app/api/invites/check/route.ts)

### 邀请码兑换

#### `POST /api/invites/redeem`

**功能**：兑换邀请码并创建新用户。

**认证要求**：无需认证

**请求体**：
```json
{
  "code": "邀请码",
  "email": "邮箱",
  "display_name": "显示名称"
}
```

**成功响应格式**：
```json
{
  "ok": true,
  "userId": "用户ID"
}
```

**错误响应**：
- `400 Bad Request`：邀请码不存在、已过期、已用完
- `500 Internal Server Error`：用户创建失败

**验证逻辑**：
1. 检查邀请码是否已被使用
2. 检查使用次数是否已用完
3. 检查是否已过期

**更新逻辑**：
- 增加使用次数
- 如果达到最大使用次数，则标记为已使用
- 记录兑换用户ID

**Section sources**
- [app/api/invites/redeem/route.ts](file://app/api/invites/redeem/route.ts)

### 邀请码生成（管理员）

#### `POST /api/admin/invites/generate`

**功能**：批量生成邀请码（管理员功能）。

**认证要求**：需要管理员权限（使用Service Role Key）

**请求体**：
```json
{
  "count": 10,
  "max_uses": 1
}
```

**成功响应格式**：
```json
{
  "ok": true,
  "codes": ["ABC12345", "XYZ67890"],
  "count": 10
}
```

**验证规则**：
- `count`：1-100之间的数字
- `max_uses`：大于等于1的数字（可选，默认为1）

**生成规则**：
- 8位长度的邀请码
- 确保唯一性
- 批量插入数据库

**Section sources**
- [app/api/admin/invites/generate/route.ts](file://app/api/admin/invites/generate/route.ts)

### 阶段问候语生成

#### `POST /api/stage-greeting`

**功能**：为指定阶段生成友好的开场白。

**认证要求**：无需认证

**请求体**：
```json
{
  "stage": "阶段名称"
}
```

**成功响应格式**：
```json
{
  "ok": true,
  "result": "生成的问候语"
}
```

**要求**：
- 只能返回一句话
- 语气专业但有温度
- 不要重复"阶段"二字

**Section sources**
- [app/api/stage-greeting/route.ts](file://app/api/stage-greeting/route.ts)

### 模拟面试API

#### `POST /api/interview`

**功能**：统一的模拟面试API，支持完整的面试流程。

**认证要求**：部分操作需要认证

**请求体通用结构**：
```json
{
  "action": "操作类型",
  "sessionId": "会话ID（可选）",
  "userId": "用户ID（可选）",
  "roundType": "轮次类型（部分操作需要）",
  "questionId": "问题ID（部分操作需要）",
  "answer": "用户回答（部分操作需要）",
  "recentMessages": [
    {
      "role": "user|assistant",
      "content": "消息内容"
    }
  ]
}
```

**支持的Action类型**：
- `start_round`：开始一轮面试
- `answer`：回答问题
- `next_question`：获取下一题
- `finish_round`：完成轮次

**统一响应结构**：
```json
{
  "type": "next-question|evaluation|round-complete|error",
  "payload": "具体数据",
  "debug": "调试信息（可选）"
}
```

#### Action详情

**1. start_round - 开始一轮面试**

**请求示例**：
```json
{
  "action": "start_round",
  "sessionId": "session_123",
  "userId": "user_456",
  "roundType": "技术面"
}
```

**响应示例**：
```json
{
  "type": "next-question",
  "payload": {
    "question": {
      "id": "q_1234567890",
      "q": "问题内容",
      "tips": {
        "intent": "考察意图",
        "keyPoints": ["关键点"],
        "framework": "回答框架",
        "industryNotes": "行业注意事项",
        "pitfalls": ["常见错误"],
        "proTips": ["专业建议"]
      }
    }
  }
}
```

**2. answer - 回答问题**

**请求示例**：
```json
{
  "action": "answer",
  "questionId": "q_1234567890",
  "answer": "我的回答...",
  "roundType": "技术面"
}
```

**响应示例**：
```json
{
  "type": "evaluation",
  "payload": {
    "questionId": "q_1234567890",
    "evaluation": {
      "accuracy": 75,
      "detail": 80,
      "logic": 70,
      "confidence": 85,
      "tips": "改进建议"
    },
    "exemplarAnswer": "示范回答"
  }
}
```

**3. next_question - 获取下一题**

**请求示例**：
```json
{
  "action": "next_question",
  "roundType": "技术面",
  "recentMessages": [
    {
      "role": "assistant",
      "content": "上一个问题"
    },
    {
      "role": "user",
      "content": "上一个回答"
    }
  ]
}
```

**4. finish_round - 完成轮次**

**请求示例**：
```json
{
  "action": "finish_round",
  "roundType": "技术面",
  "recentMessages": [
    {
      "role": "assistant",
      "content": "问题1"
    },
    {
      "role": "user",
      "content": "回答1"
    }
  ]
}
```

**响应示例**：
```json
{
  "type": "round-complete",
  "payload": {
    "summary": {
      "scores": {
        "accuracy": 75,
        "detail": 65,
        "logic": 80,
        "confidence": 70
      },
      "highlights": ["亮点"],
      "gaps": ["不足"],
      "practiceSuggestions": ["练习建议"]
    },
    "reportId": "report_1234567890"
  }
}
```

**支持的轮次类型**：
- `业务面`
- `项目深挖`
- `技术面`
- `HR面`
- `总监面`

**工作模式**：
- **Stub模式**：当`DEEPSEEK_API_KEY`未设置时，返回预设的模拟数据
- **DeepSeek模式**：当`DEEPSEEK_API_KEY`设置时，调用DeepSeek模型生成动态内容
- **降级机制**：如果DeepSeek调用失败，自动降级到Stub模式

**调试信息**：
响应中的`debug`字段包含调试信息：
- `mode`：当前模式（"stub"或"deepseek"）
- 其他字段根据操作类型不同而不同

**Section sources**
- [docs/interview_api.md](file://docs/interview_api.md)
- [docs/interview_api_debug.md](file://docs/interview_api_debug.md)

## 客户端调用示例

### 使用fetch调用

```javascript
// 健康检查
async function checkHealth() {
  const response = await fetch('/api/health');
  const data = await response.json();
  console.log(data);
}

// 解析简历
async function parseResume(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('/api/parse-resume', {
    method: 'POST',
    body: formData
  });
  const data = await response.json();
  return data;
}

// 模拟面试 - 开始一轮
async function startInterview(roundType) {
  const response = await fetch('/api/interview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'start_round',
      roundType: roundType
    })
  });
  const data = await response.json();
  return data;
}

// 模拟面试 - 回答问题
async function answerQuestion(questionId, answer, roundType) {
  const response = await fetch('/api/interview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'answer',
      questionId: questionId,
      answer: answer,
      roundType: roundType
    })
  });
  const data = await response.json();
  return data;
}
```

### 使用axios调用

```javascript
// 配置axios实例
const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true // 确保发送cookie
});

// 检查邀请码
async function checkInviteCode(code) {
  try {
    const response = await apiClient.get('/invites/check', {
      params: { code }
    });
    return response.data;
  } catch (error) {
    console.error('检查邀请码失败:', error);
    throw error;
  }
}

// 发送短信验证码
async function sendSms(phone) {
  try {
    const response = await apiClient.post('/sms', { phone });
    return response.data;
  } catch (error) {
    console.error('发送短信失败:', error);
    throw error;
  }
}
```

### 封装的API客户端

项目提供了封装的API客户端，自动处理401错误：

```javascript
// lib/api-client.ts
export async function apiFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await apiFetch(url, options);
  
  if (!response.ok) {
    if (response.status !== 401) {
      const error = await response.json().catch(() => ({ error: "未知错误" }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
  }
  
  return response.json();
}
```

**Section sources**
- [lib/api-client.ts](file://lib/api-client.ts)

## API测试工具

### Postman
推荐使用Postman进行API测试，可以方便地：
- 保存和组织API请求
- 设置环境变量
- 编写测试脚本
- 生成文档

**Postman集合示例**：
1. 创建"AI Job Coach API"集合
2. 添加各个端点的请求
3. 设置环境变量（如base URL）
4. 编写测试脚本验证响应

### curl命令
对于快速测试，可以使用curl命令：

```bash
# 健康检查
curl http://localhost:3000/api/health

# 检查邀请码
curl "http://localhost:3000/api/invites/check?code=ABC12345"

# 发送短信验证码
curl -X POST http://localhost:3000/api/sms \
  -H "Content-Type: application/json" \
  -d '{"phone": "13800138000"}'

# 模拟面试 - 开始一轮
curl -X POST http://localhost:3000/api/interview \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start_round",
    "roundType": "技术面"
  }'
```

### 浏览器开发者工具
可以直接在浏览器控制台中测试API：

```javascript
// 在浏览器控制台中执行
fetch('/api/health')
  .then(res => res.json())
  .then(data => console.log(data));
```

## API版本控制与向后兼容性

### 版本控制策略
当前系统采用简单的版本控制策略：
- **路径版本控制**：API端点位于`/api`路径下，未来可通过`/api/v2`等方式进行版本升级
- **向后兼容性**：尽量保持现有API的向后兼容性
- **弃用策略**：当需要修改API时，先添加新端点，保持旧端点运行一段时间后标记为弃用

### 向后兼容性保证
- **请求体兼容性**：新增字段应为可选，不影响现有客户端
- **响应格式兼容性**：只添加新字段，不删除或修改现有字段
- **错误响应一致性**：保持错误响应格式的统一

### 未来扩展
建议的未来版本控制方案：
```text
/api/v1/health
/api/v1/parse-resume
/api/v2/interview
```

当引入不兼容的更改时，应创建新版本的API，同时保持旧版本运行一段时间以允许客户端迁移。

**Section sources**
- [app/api/README.md](file://app/api/README.md)
- [docs/interview_api.md](file://docs/interview_api.md)