# API 目录结构说明

本文档详细说明了 `app/api` 目录下的所有 API 路由及其功能，并提供可直接复制粘贴的测试代码。

## 📁 目录结构

```
app/api/
├── admin/
│   └── invites/
│       └── generate/
│           └── route.ts        # 生成邀请码
├── analyze/
│   └── route.ts                # 对话分析，提取白板数据
├── chat/
│   └── route.ts                # 主聊天 API（阶段化对话）
├── demo-chat/
│   └── route.ts                # 演示聊天 API
├── health/
│   └── route.ts                # 健康检查端点
├── interview/
│   ├── assess/
│   │   └── route.ts            # 面试回答评估
│   └── route.ts                # 面试功能主 API
├── invites/
│   ├── check/
│   │   └── route.ts            # 检查邀请码状态
│   └── redeem/
│       └── route.ts            # 兑换邀请码并创建用户
├── load-session/
│   └── route.ts                # 加载会话数据
├── parse-files/
│   └── route.ts                # 解析上传的文件
├── parse-resume/
│   └── route.ts                # 解析简历为结构化 JSON
├── resume-optimize/
│   └── route.ts                # 简历优化建议
├── save-whiteboard/
│   └── route.ts                # 保存白板数据
├── sms/
│   └── route.ts                # 发送短信验证码
└── verify/
    └── route.ts                # 验证短信验证码
```

---

## 🔥 API 详细说明与测试代码

### 1. 管理员功能

#### `/api/admin/invites/generate` (POST)

**功能**：批量生成邀请码

**请求体**：
```json
{
  "count": 10,
  "max_uses": 1
}
```

**返回**：
```json
{
  "ok": true,
  "codes": ["ABC12345", "XYZ67890"],
  "count": 10
}
```

**cURL 测试代码**：
```bash
curl -X POST http://localhost:3000/api/admin/invites/generate \
  -H "Content-Type: application/json" \
  -d '{
    "count": 10,
    "max_uses": 1
  }'
```

**JavaScript/Fetch 测试代码**：
```javascript
const response = await fetch('/api/admin/invites/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    count: 10,
    max_uses: 1
  })
});
const data = await response.json();
console.log(data);
```

**特点**：
- 使用 Service Role Key 确保完整权限
- 自动检查唯一性，避免重复
- 生成 8 位长度的邀请码
- 批量插入到 `invites` 表
- `max_uses` 可选，默认为 1

---

### 2. 核心聊天功能

#### `/api/chat` (POST)

**功能**：主聊天 API，支持阶段化求职辅导对话

**请求体**：
```json
{
  "message": "我想转行做产品经理",
  "userStage": "career_planning",
  "allHistory": [
    {
      "role": "user",
      "content": "你好",
      "stage": "career_planning"
    },
    {
      "role": "assistant",
      "content": "你好！我是你的 AI 求职教练。",
      "stage": "career_planning"
    }
  ],
  "history": [
    {
      "role": "user",
      "content": "你好"
    },
    {
      "role": "assistant",
      "content": "你好！我是你的 AI 求职教练。"
    }
  ],
  "userState": {
    "currentStage": "career_planning",
    "identity": "产品经理"
  },
  "userId": "user-uuid",
  "sessionId": "session-uuid"
}
```

**返回**：
```json
{
  "reply": "很好！产品经理是一个很有前景的职业...",
  "structured": {
    "intentRole": "产品经理",
    "keySkills": ["产品设计", "用户研究"]
  },
  "shouldAdvance": false,
  "nextStage": "career_planning",
  "stageEvaluation": {
    "reason": "继续当前阶段"
  }
}
```

**cURL 测试代码**：
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "我想转行做产品经理",
    "userStage": "career_planning",
    "allHistory": [],
    "history": [],
    "userId": "test-user-id",
    "sessionId": "test-session-id"
  }'
```

**JavaScript/Fetch 测试代码**：
```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "我想转行做产品经理",
    userStage: "career_planning",
    allHistory: [],
    history: [],
    userId: "test-user-id",
    sessionId: "test-session-id"
  })
});
const data = await response.json();
console.log(data);
```

**支持的阶段**：
- `career_planning` - 职业规划
- `project_review` - 项目梳理
- `resume_optimization` - 简历优化
- `application_strategy` - 投递策略
- `interview` - 面试辅导
- `salary_talk` - 谈薪策略
- `offer` - Offer 选择

---

#### `/api/demo-chat` (POST)

**功能**：演示聊天 API，用于快速演示和测试

**请求体**：
```json
{
  "sessionId": "session-id",
  "message": "你好",
  "onboarding": {
    "identity": "产品经理",
    "intentRole": "高级产品经理",
    "stage": "还没写简历"
  }
}
```

**返回**：
```json
{
  "sessionId": "session-id",
  "reply": "你好！我是你的 AI 求职教练...",
  "analysisData": {
    "targetJob": "产品经理",
    "keyCapabilities": ["产品设计", "用户研究"],
    "projects": []
  }
}
```

**cURL 测试代码**：
```bash
curl -X POST http://localhost:3000/api/demo-chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "",
    "message": "你好",
    "onboarding": {
      "identity": "产品经理",
      "intentRole": "高级产品经理",
      "stage": "还没写简历"
    }
  }'
```

**JavaScript/Fetch 测试代码**：
```javascript
const response = await fetch('/api/demo-chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: "",
    message: "你好",
    onboarding: {
      identity: "产品经理",
      intentRole: "高级产品经理",
      stage: "还没写简历"
    }
  })
});
const data = await response.json();
console.log(data);
```

---

### 3. 对话分析

#### `/api/analyze` (POST)

**功能**：分析对话内容，提取结构化白板数据

**请求体**：
```json
{
  "messages": [
    {
      "role": "user",
      "content": "我想做产品经理",
      "isUser": true
    },
    {
      "role": "assistant",
      "content": "很好！产品经理需要哪些技能？",
      "isUser": false
    }
  ],
  "userStage": "career_planning",
  "sessionId": "session-uuid"
}
```

**返回**：
```json
{
  "intentRole": "产品经理",
  "keySkills": ["产品设计", "用户研究"],
  "starProjects": [],
  "resumeInsights": [],
  "interviewReports": [],
  "targetCompanies": [],
  "salaryStrategy": {},
  "offers": []
}
```

**cURL 测试代码**：
```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "我想做产品经理",
        "isUser": true
      }
    ],
    "userStage": "career_planning",
    "sessionId": "test-session-id"
  }'
```

**JavaScript/Fetch 测试代码**：
```javascript
const response = await fetch('/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [
      {
        role: "user",
        content: "我想做产品经理",
        isUser: true
      }
    ],
    userStage: "career_planning",
    sessionId: "test-session-id"
  })
});
const data = await response.json();
console.log(data);
```

**注意**：此 API 需要 `analyzeConversationChain` 函数，请确保已实现 `@/lib/agents/analyze`。

---

### 4. 面试功能

#### `/api/interview` (POST)

**功能**：模拟面试统一 API，支持完整面试流程

**Action: `start_round` - 开始一轮面试**

**请求体**：
```json
{
  "action": "start_round",
  "sessionId": "session-uuid",
  "userId": "user-uuid",
  "roundType": "业务面"
}
```

**返回**：
```json
{
  "type": "next-question",
  "payload": {
    "question": {
      "id": "q_1234567890",
      "q": "请介绍一下你最近负责的一个产品项目，包括项目背景、你的角色、关键决策和最终成果。",
      "tips": {
        "intent": "考察产品思维、项目管理和结果导向能力",
        "keyPoints": [
          "项目背景和目标要清晰",
          "突出个人在项目中的核心贡献",
          "关键决策要有理有据",
          "成果要量化，最好有数据支撑"
        ],
        "framework": "背景 → 目标 → 我的角色 → 关键决策 → 执行过程 → 结果指标",
        "industryNotes": "产品经理需要具备从0到1的产品能力，以及跨部门协作能力",
        "pitfalls": ["只讲过程不讲结果", "没有突出个人贡献", "缺乏数据支撑"],
        "proTips": ["用 STAR 法则组织回答", "准备1-2个具体的数据指标", "体现产品思维和用户视角"]
      }
    }
  }
}
```

**cURL 测试代码**：
```bash
curl -X POST http://localhost:3000/api/interview \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start_round",
    "sessionId": "test-session-id",
    "userId": "test-user-id",
    "roundType": "业务面"
  }'
```

**Action: `answer` - 回答问题并获取评估**

**请求体**：
```json
{
  "action": "answer",
  "questionId": "q_1234567890",
  "answer": "我最近负责了一个用户增长项目。背景是用户增长放缓，目标是提升新用户注册转化率。我负责产品设计和数据监控。关键决策是简化注册流程，从5步减少到2步。最终转化率提升了30%。",
  "roundType": "业务面",
  "recentMessages": [
    {
      "role": "assistant",
      "content": "请介绍一下你最近负责的一个产品项目..."
    }
  ]
}
```

**返回**：
```json
{
  "type": "evaluation",
  "payload": {
    "questionId": "q_1234567890",
    "evaluation": {
      "accuracy": 85,
      "grammar": 80,
      "detail": 75,
      "confidence": 85,
      "tips": "回答很好，数据支撑充分。建议在逻辑结构上可以更清晰一些。"
    },
    "exemplarAnswer": "这是一个示范回答，包含了项目背景、个人角色、关键决策、执行过程和量化结果。"
  }
}
```

**cURL 测试代码**：
```bash
curl -X POST http://localhost:3000/api/interview \
  -H "Content-Type: application/json" \
  -d '{
    "action": "answer",
    "questionId": "q_1234567890",
    "answer": "我最近负责了一个用户增长项目...",
    "roundType": "业务面"
  }'
```

**Action: `next_question` - 获取下一个问题**

**请求体**：
```json
{
  "action": "next_question",
  "roundType": "业务面",
  "questionCount": 3,
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

**Action: `finish_round` - 完成当前轮次**

**请求体**：
```json
{
  "action": "finish_round",
  "roundType": "业务面",
  "recentMessages": [
    {
      "role": "assistant",
      "content": "问题1"
    },
    {
      "role": "user",
      "content": "回答1"
    },
    {
      "role": "assistant",
      "content": "问题2"
    },
    {
      "role": "user",
      "content": "回答2"
    }
  ]
}
```

**返回**：
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
      "highlights": ["结构清晰", "逻辑性强", "表达流畅"],
      "gaps": ["项目细节可以更具体", "数据支撑可以更充分"],
      "practiceSuggestions": [
        "补充一个更定量的项目结果",
        "准备更多 STAR 案例",
        "加强数据化表达"
      ]
    },
    "reportId": "report_1234567890"
  }
}
```

**支持的轮次类型**：
- `业务面`
- `技术面`
- `HR面`
- `主管面` / `总监面`
- `项目深挖`

---

#### `/api/interview/assess` (POST)

**状态**：已停用（HTTP 410）。旧接口只按字数和关键词生成固定分数，不能作为真实 AI 面试评估。

请改用 `/api/interview/start` 创建有岗位、轮次和简历上下文的会话，再通过 `/api/interview/answer` 提交回答。后者包含登录校验、知识库检索、AI 评估、并发幂等和额度记录。

---

### 5. 邀请码系统

#### `/api/invites/check` (GET)

**功能**：检查邀请码状态

**请求 URL**：
```
GET /api/invites/check?code=ABC12345
```

**返回**：
```json
{
  "ok": true,
  "status": "valid",
  "code": "ABC12345",
  "message": "邀请码有效",
  "data": {
    "created_at": "2024-01-01T00:00:00Z",
    "expires_at": null,
    "used": false,
    "uses_count": 0,
    "max_uses": 1
  }
}
```

**cURL 测试代码**：
```bash
curl "http://localhost:3000/api/invites/check?code=ABC12345"
```

**JavaScript/Fetch 测试代码**：
```javascript
const response = await fetch('/api/invites/check?code=ABC12345');
const data = await response.json();
console.log(data);
```

**POST 方式**：

**请求体**：
```json
{
  "code": "ABC12345"
}
```

**cURL 测试代码**：
```bash
curl -X POST http://localhost:3000/api/invites/check \
  -H "Content-Type: application/json" \
  -d '{
    "code": "ABC12345"
  }'
```

**状态说明**：
- `valid` - 有效
- `remaining` - 有效但剩余次数较少（≤1）
- `expired` - 已过期
- `redeemed` - 已被使用/已用完
- `invalid` - 不存在

---

#### `/api/invites/redeem` (POST)

**功能**：兑换邀请码并创建用户

**请求体**：
```json
{
  "code": "ABC12345",
  "email": "test@example.com",
  "display_name": "张三"
}
```

**返回**：
```json
{
  "ok": true,
  "userId": "uuid-string"
}
```

**错误返回**：
```json
{
  "ok": false,
  "error": "邀请码已被使用"
}
```

**cURL 测试代码**：
```bash
curl -X POST http://localhost:3000/api/invites/redeem \
  -H "Content-Type: application/json" \
  -d '{
    "code": "ABC12345",
    "email": "test@example.com",
    "display_name": "张三"
  }'
```

**JavaScript/Fetch 测试代码**：
```javascript
const response = await fetch('/api/invites/redeem', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: "ABC12345",
    email: "test@example.com",
    display_name: "张三"
  })
});
const data = await response.json();
console.log(data);
```

**验证逻辑**：
1. 检查 `used === true` → 报"邀请码已被使用"
2. 检查 `uses_count >= max_uses` → 报"邀请码使用次数已用完"
3. 检查 `expires_at < now()` → 报"邀请码已过期"

**更新逻辑**：
- `uses_count = uses_count + 1`
- 如果 `uses_count + 1 >= max_uses`，则 `used = true`
- `redeemed_by = userId`

---

### 6. 会话管理

#### `/api/load-session` (POST)

**功能**：加载会话数据（消息、白板、用户阶段）

**请求体**：
```json
{
  "userId": "user-uuid",
  "sessionId": "session-uuid"
}
```

**或者**：
```json
{
  "phone": "13800138000",
  "email": "test@example.com"
}
```

**返回**：
```json
{
  "userId": "user-uuid",
  "sessionId": "session-uuid",
  "messages": [
    {
      "id": "msg-id",
      "content": "你好",
      "isUser": true,
      "timestamp": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": "msg-id-2",
      "content": "你好！我是你的 AI 求职教练。",
      "isUser": false,
      "timestamp": "2024-01-01T00:00:01.000Z"
    }
  ],
  "whiteboard": {
    "intentRole": "产品经理",
    "keySkills": []
  },
  "currentStage": "career_planning"
}
```

**cURL 测试代码**：
```bash
curl -X POST http://localhost:3000/api/load-session \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "sessionId": "test-session-id"
  }'
```

**JavaScript/Fetch 测试代码**：
```javascript
const response = await fetch('/api/load-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: "test-user-id",
    sessionId: "test-session-id"
  })
});
const data = await response.json();
console.log(data);
```

---

### 7. 文件处理

#### `/api/parse-files` (POST)

**功能**：解析上传的多个文件内容

**请求方式**：`multipart/form-data`

**请求体（FormData）**：
```
files: File[] (多个文件)
```

**返回**：
```json
{
  "content": "合并后的文件内容\n\n---\n\n文件2的内容",
  "fileCount": 2
}
```

**cURL 测试代码**：
```bash
curl -X POST http://localhost:3000/api/parse-files \
  -F "files=@file1.txt" \
  -F "files=@file2.txt"
```

**JavaScript/Fetch 测试代码**：
```javascript
const formData = new FormData();
formData.append('files', file1);
formData.append('files', file2);

const response = await fetch('/api/parse-files', {
  method: 'POST',
  body: formData
});
const data = await response.json();
console.log(data);
```

**支持格式**：
- PDF（占位符，待实现）
- DOCX（占位符，待实现）
- TXT（已实现）

---

#### `/api/parse-resume` (POST)

**功能**：解析简历文件为结构化 JSON

**请求方式**：`multipart/form-data`

**请求体（FormData）**：
```
file: File (单个简历文件)
```

**返回**：
```json
{
  "success": true,
  "data": {
    "name": "张三",
    "education": [
      {
        "school": "清华大学",
        "major": "计算机科学",
        "degree": "本科",
        "startDate": "2018-09",
        "endDate": "2022-06"
      }
    ],
    "experience": [
      {
        "company": "XX公司",
        "position": "产品经理",
        "startDate": "2022-07",
        "endDate": "2024-01",
        "description": "负责产品设计和开发..."
      }
    ]
  }
}
```

**cURL 测试代码**：
```bash
curl -X POST http://localhost:3000/api/parse-resume \
  -F "file=@resume.pdf"
```

**JavaScript/Fetch 测试代码**：
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('/api/parse-resume', {
  method: 'POST',
  body: formData
});
const data = await response.json();
console.log(data);
```

**支持格式**：
- PDF（使用 pdf-parse）
- DOCX/DOC（使用 mammoth）
- TXT

---

### 8. 简历优化

#### `/api/resume-optimize` (POST)

**功能**：基于简历内容生成优化建议

**请求方式**：`multipart/form-data`

**请求体（FormData）**：
```
file: File (简历文件，目前仅支持 .txt)
```

**返回**：
```json
{
  "suggestions": "1. 量化成果：将"提升了用户满意度"改为"用户满意度从70%提升到85%"\n2. 突出关键词：在项目经历中增加"产品设计"、"数据分析"等关键词\n3. 使用动作词：用"负责"、"主导"、"优化"等动词开头，增强表达力"
}
```

**cURL 测试代码**：
```bash
curl -X POST http://localhost:3000/api/resume-optimize \
  -F "file=@resume.txt"
```

**JavaScript/Fetch 测试代码**：
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('/api/resume-optimize', {
  method: 'POST',
  body: formData
});
const data = await response.json();
console.log(data);
```

---

### 9. 白板数据

#### `/api/save-whiteboard` (POST)

**功能**：保存白板数据结构化数据

**请求体**：
```json
{
  "user_id": "user-uuid",
  "session_id": "session-uuid",
  "whiteboard": {
    "intentRole": "产品经理",
    "keySkills": ["产品设计", "用户研究"],
    "starProjects": [
      {
        "id": "project_1",
        "title": "用户增长项目",
        "situation": "用户增长放缓",
        "task": "提升新用户注册转化率",
        "action": "简化注册流程",
        "result": "转化率提升30%",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "resumeInsights": [],
    "interviewReports": [],
    "targetCompanies": [],
    "salaryStrategy": {},
    "offers": []
  }
}
```

**返回**：
```json
{
  "success": true
}
```

**cURL 测试代码**：
```bash
curl -X POST http://localhost:3000/api/save-whiteboard \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user-id",
    "session_id": "test-session-id",
    "whiteboard": {
      "intentRole": "产品经理",
      "keySkills": ["产品设计", "用户研究"]
    }
  }'
```

**JavaScript/Fetch 测试代码**：
```javascript
const response = await fetch('/api/save-whiteboard', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: "test-user-id",
    session_id: "test-session-id",
    whiteboard: {
      intentRole: "产品经理",
      keySkills: ["产品设计", "用户研究"]
    }
  })
});
const data = await response.json();
console.log(data);
```

**数据库字段**：
- `user_id` - 用户 ID
- `session_id` - 会话 ID
- `data` - 白板数据（JSON 对象）

---

### 10. 短信验证

#### `/api/sms` (POST)

**功能**：发送短信验证码

**请求体**：
```json
{
  "phone": "13800138000"
}
```

**返回**：
```json
{
  "success": true,
  "code": "123456",
  "response": {
    "Code": "OK",
    "Message": "OK"
  }
}
```

**cURL 测试代码**：
```bash
curl -X POST http://localhost:3000/api/sms \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "13800138000"
  }'
```

**JavaScript/Fetch 测试代码**：
```javascript
const response = await fetch('/api/sms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phone: "13800138000"
  })
});
const data = await response.json();
console.log(data);
```

**环境变量**：
- `ALIYUN_ACCESS_KEY_ID`
- `ALIYUN_ACCESS_KEY_SECRET`
- `ALIYUN_SMS_SIGN_NAME`
- `ALIYUN_SMS_TEMPLATE_CODE`

---

#### `/api/verify` (POST)

**功能**：验证短信验证码

**请求体**：
```json
{
  "phone": "13800138000",
  "code": "123456"
}
```

**返回**：
```json
{
  "success": true
}
```

**错误返回**：
```json
{
  "success": false,
  "msg": "验证码错误或已过期"
}
```

**cURL 测试代码**：
```bash
curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "13800138000",
    "code": "123456"
  }'
```

**JavaScript/Fetch 测试代码**：
```javascript
const response = await fetch('/api/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phone: "13800138000",
    code: "123456"
  })
});
const data = await response.json();
console.log(data);
```

---

### 11. 健康检查

#### `/api/health` (GET)

**功能**：健康检查端点，用于部署平台监控

**请求 URL**：
```
GET /api/health
```

**返回**：
```json
{
  "ok": true,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**cURL 测试代码**：
```bash
curl http://localhost:3000/api/health
```

**JavaScript/Fetch 测试代码**：
```javascript
const response = await fetch('/api/health');
const data = await response.json();
console.log(data);
```

---

## 🔧 技术特点

### Runtime 配置

大部分 API 使用 `nodejs` runtime，原因：
- 需要访问 Node.js 原生模块（如 `crypto`、`fs`）
- 使用 faiss-node 等 Node.js 专用库
- 需要完整的文件系统访问

### 数据库集成

- 使用 Supabase 作为后端数据库
- 支持 Service Role Key（完整权限）和 Anon Key（匿名访问）
- 完整的错误处理和事务支持

### AI 集成

- 主要使用 DeepSeek API
- 支持多种提示词策略和温度设置
- 结构化输出（JSON 格式）
- 错误降级处理（stub 模式）

### 会话管理

- 支持数据库持久化会话
- 降级到 localStorage（数据库不可用时）
- 自动创建用户和会话

---

## 🌍 环境变量

### 必需的环境变量

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# DeepSeek
DEEPSEEK_API_KEY=your-deepseek-api-key

# 阿里云 SMS（可选）
ALIYUN_ACCESS_KEY_ID=your-access-key-id
ALIYUN_ACCESS_KEY_SECRET=your-access-key-secret
ALIYUN_SMS_SIGN_NAME=your-sign-name
ALIYUN_SMS_TEMPLATE_CODE=your-template-code
```

---

## 📝 测试指南

### 使用 Postman 测试

1. 导入以下 JSON 到 Postman：

```json
{
  "info": {
    "name": "AI Job Coach API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Health Check",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:3000/api/health",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "health"]
        }
      }
    },
    {
      "name": "Generate Invites",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"count\": 10,\n  \"max_uses\": 1\n}"
        },
        "url": {
          "raw": "http://localhost:3000/api/admin/invites/generate",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "admin", "invites", "generate"]
        }
      }
    },
    {
      "name": "Check Invite",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:3000/api/invites/check?code=ABC12345",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "invites", "check"],
          "query": [
            {
              "key": "code",
              "value": "ABC12345"
            }
          ]
        }
      }
    }
  ]
}
```

### 使用 VS Code REST Client 扩展

创建 `api-tests.http` 文件：

```http
### Health Check
GET http://localhost:3000/api/health

### Generate Invites
POST http://localhost:3000/api/admin/invites/generate
Content-Type: application/json

{
  "count": 10,
  "max_uses": 1
}

### Check Invite
GET http://localhost:3000/api/invites/check?code=ABC12345

### Redeem Invite
POST http://localhost:3000/api/invites/redeem
Content-Type: application/json

{
  "code": "ABC12345",
  "email": "test@example.com",
  "display_name": "张三"
}

### Chat
POST http://localhost:3000/api/chat
Content-Type: application/json

{
  "message": "我想转行做产品经理",
  "userStage": "career_planning",
  "userId": "test-user-id",
  "sessionId": "test-session-id"
}

### Interview - Start Round
POST http://localhost:3000/api/interview
Content-Type: application/json

{
  "action": "start_round",
  "roundType": "业务面",
  "sessionId": "test-session-id",
  "userId": "test-user-id"
}

### Interview - Answer
POST http://localhost:3000/api/interview
Content-Type: application/json

{
  "action": "answer",
  "questionId": "q_1234567890",
  "answer": "我负责了一个用户增长项目...",
  "roundType": "业务面"
}

### Save Whiteboard
POST http://localhost:3000/api/save-whiteboard
Content-Type: application/json

{
  "user_id": "test-user-id",
  "session_id": "test-session-id",
  "whiteboard": {
    "intentRole": "产品经理",
    "keySkills": ["产品设计", "用户研究"]
  }
}
```

---

## 🎯 使用建议

1. **聊天功能**：优先使用 `/api/chat`，它支持完整的阶段化对话和数据结构化
2. **演示测试**：使用 `/api/demo-chat` 进行快速测试和演示
3. **面试练习**：使用 `/api/interview` 进行完整的模拟面试流程
4. **简历处理**：使用 `/api/parse-resume` 解析结构化简历，使用 `/api/resume-optimize` 获取优化建议
5. **会话恢复**：使用 `/api/load-session` 加载历史会话和数据结构

---

## 📋 错误处理

所有 API 都遵循统一的错误格式：

**成功响应**：
- HTTP 200-299 状态码
- 包含业务数据的 JSON 响应

**错误响应**：
```json
{
  "ok": false,
  "error": "错误描述",
  "message": "详细错误信息（可选）"
}
```

常见 HTTP 状态码：
- `400` - 请求参数错误
- `401` - 未授权
- `404` - 资源不存在
- `500` - 服务器内部错误

---

## 🔄 更新日志

- 2024-01-XX：初始版本，包含核心聊天、面试、邀请码等功能
- 2024-01-XX：更新邀请码系统，支持 `uses_count` 和 `max_uses` 字段
- 2024-01-XX：更新白板保存 API，使用 `user_id`、`session_id`、`data` 字段结构

---

## ⚠️ 注意事项

1. 部分 API 使用 Service Role Key，确保环境变量安全
2. 短信验证码存储在内存中，服务器重启后会丢失
3. 文件上传大小限制需要在服务器配置中设置
4. 邀请码生成使用原子性操作，但建议在生产环境中添加速率限制
5. `/api/analyze` 需要 `analyzeConversationChain` 函数，请确保已实现相关依赖
