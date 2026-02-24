# API路由详解

<cite>
**本文档引用文件**   
- [app/api/auth/create-session/route.ts](file://app/api/auth/create-session/route.ts)
- [app/api/resume/upload/route.ts](file://app/api/resume/upload/route.ts)
- [app/api/parse-resume/route.ts](file://app/api/parse-resume/route.ts)
- [app/api/interview/start/route.ts](file://app/api/interview/start/route.ts)
- [app/api/interview/answer/route.ts](file://app/api/interview/answer/route.ts)
- [app/api/interview/assess/route.ts](file://app/api/interview/assess/route.ts)
- [app/api/interview/complete/route.ts](file://app/api/interview/complete/route.ts)
- [app/api/interview/summary/route.ts](file://app/api/interview/summary/route.ts)
- [app/api/load-session/route.ts](file://app/api/load-session/route.ts)
- [app/api/save-whiteboard/route.ts](file://app/api/save-whiteboard/route.ts)
- [app/api/load-whiteboard/route.ts](file://app/api/load-whiteboard/route.ts)
- [app/api/resume/parse/route.ts](file://app/api/resume/parse/route.ts)
- [app/api/README.md](file://app/api/README.md)
- [app/api/health/route.ts](file://app/api/health/route.ts)
- [app/api/verify/route.ts](file://app/api/verify/route.ts)
- [app/api/verify-invite/route.ts](file://app/api/verify-invite/route.ts)
- [app/api/invites/check/route.ts](file://app/api/invites/check/route.ts)
- [app/api/invites/redeem/route.ts](file://app/api/invites/redeem/route.ts)
- [app/api/admin/invites/generate/route.ts](file://app/api/admin/invites/generate/route.ts)
</cite>

## 目录

1. [项目结构概述](#项目结构概述)
2. [认证与会话管理](#认证与会话管理)
3. [简历处理流程](#简历处理流程)
4. [面试流程控制](#面试流程控制)
5. [状态管理机制](#状态管理机制)
6. [安全与错误处理](#安全与错误处理)
7. [API调用示例与测试](#api调用示例与测试)
8. [性能优化建议](#性能优化建议)

## 项目结构概述

AI求职教练项目的API路由采用Next.js App Router架构，所有后端接口均位于`app/api/`目录下，通过文件系统路由自动生成RESTful端点。每个API功能模块以独立子目录组织，包含`route.ts`文件定义请求处理逻辑。

```mermaid
graph TB
subgraph "API路由结构"
A[app/api]
A --> B[auth]
A --> C[resume]
A --> D[interview]
A --> E[session]
A --> F[invites]
A --> G[health]
B --> B1[create-session]
C --> C1[upload]
C --> C2[parse]
C --> C3[delete[resume_id]]
D --> D1[start]
D --> D2[answer]
D --> D3[assess]
D --> D4[complete]
D --> D5[summary]
E --> E1[load-session]
E --> E2[save-whiteboard]
E --> E3[load-whiteboard]
F --> F1[check]
F --> F2[redeem]
F --> F3[generate]
end
```

**图示来源**
- [app/api/README.md](file://app/api/README.md)

## 认证与会话管理

### 认证流程实现

系统采用基于邀请码的认证机制，通过Supabase身份验证服务管理用户会话。核心流程包括邀请码验证、用户创建和会话令牌生成。

```mermaid
sequenceDiagram
participant 前端
participant createSessionAPI
participant SupabaseAdmin
participant 数据库
前端->>createSessionAPI : POST /api/auth/create-session {inviteCode}
createSessionAPI->>createSessionAPI : 验证请求参数
createSessionAPI->>SupabaseAdmin : 查询邀请码
SupabaseAdmin-->>createSessionAPI : 返回邀请码信息
alt 邀请码已使用
createSessionAPI->>createSessionAPI : 返回已绑定的userId
else 新用户
createSessionAPI->>SupabaseAdmin : 创建新用户
SupabaseAdmin-->>createSessionAPI : 返回用户ID
createSessionAPI->>数据库 : 更新邀请码使用记录
createSessionAPI->>数据库 : 更新用户资料
end
createSessionAPI->>createSessionAPI : 生成会话令牌
createSessionAPI->>前端 : 设置cookie并返回userId
```

**图示来源**
- [app/api/auth/create-session/route.ts](file://app/api/auth/create-session/route.ts)

### 会话生命周期管理

系统通过`load-session`和`create-session`接口管理用户会话状态，确保前后端状态同步。

```mermaid
flowchart TD
A[前端发起请求] --> B{是否携带有效会话cookie?}
B --> |否| C[返回401未认证]
B --> |是| D[解析会话令牌]
D --> E{用户是否存在?}
E --> |否| F[返回401未认证]
E --> |是| G[返回用户信息]
G --> H[前端更新本地状态]
```

**图示来源**
- [app/api/load-session/route.ts](file://app/api/load-session/route.ts)

## 简历处理流程

### 简历上传与存储

简历上传流程涉及文件解析、云存储和数据库记录三个主要步骤，确保文件安全存储和元数据持久化。

```mermaid
sequenceDiagram
participant 前端
participant 上传API
participant SupabaseStorage
participant 数据库
前端->>上传API : POST /api/resume/upload multipart/form-data
上传API->>上传API : 验证用户身份
上传API->>上传API : 解析multipart表单
上传API->>上传API : 验证文件类型(pdf/doc/docx)
上传API->>SupabaseStorage : 上传文件到resume-files桶
SupabaseStorage-->>上传API : 返回公共URL
上传API->>数据库 : 插入user_resumes记录
数据库-->>上传API : 确认插入成功
上传API->>前端 : 返回resume_id和文件URL
```

**图示来源**
- [app/api/resume/upload/route.ts](file://app/api/resume/upload/route.ts)

### 简历解析与结构化

简历解析流程结合PDF/Word文件解析库和LLM技术，将非结构化简历内容转换为结构化JSON数据。

```mermaid
flowchart LR
A[前端] --> B[parse-resume API]
B --> C{文件类型}
C --> |PDF| D[pdf-parse库]
C --> |DOCX| E[mammoth库]
D --> F[提取原始文本]
E --> F
F --> G[构建LLM提示词]
G --> H[调用LLM生成JSON]
H --> I[清理JSON格式]
I --> J[返回结构化数据]
J --> A
```

**图示来源**
- [app/api/parse-resume/route.ts](file://app/api/parse-resume/route.ts)

### 动态路径参数处理

系统使用动态API路径处理简历删除等操作，通过方括号语法`delete[resume_id]`实现参数化路由。

```mermaid
sequenceDiagram
participant 前端
participant 动态API
participant 数据库
前端->>动态API : DELETE /api/resume/delete[resume_id]
动态API->>动态API : 从路径提取resume_id
动态API->>动态API : 验证用户身份
动态API->>数据库 : 查询简历记录
数据库-->>动态API : 返回简历信息
动态API->>动态API : 验证用户权限
dynamicAPI->>数据库 : 删除简历记录
数据库-->>动态API : 确认删除
dynamicAPI->>前端 : 返回操作结果
```

**图示来源**
- [app/api/resume/parse/route.ts](file://app/api/resume/parse/route.ts)

## 面试流程控制

### 面试会话初始化

`/api/interview/start`接口负责创建新的面试会话，生成面试题目并持久化会话状态。

```mermaid
sequenceDiagram
participant 前端
participant startAPI
participant 数据库
participant LLM
前端->>startAPI : POST /api/interview/start {jd, roundType}
startAPI->>startAPI : 验证用户身份
startAPI->>startAPI : 验证请求参数
startAPI->>数据库 : 创建interview_sessions记录
数据库-->>startAPI : 确认创建
startAPI->>LLM : 调用generateInterviewQuestions
LLM-->>startAPI : 返回面试题目
startAPI->>数据库 : 保存题目到interview_questions
数据库-->>startAPI : 确认保存
startAPI->>前端 : 返回session_id和题目列表
```

**图示来源**
- [app/api/interview/start/route.ts](file://app/api/interview/start/route.ts)

### 答题与评估流程

面试答题流程通过`answer`和`assess`两个接口实现，分别处理答案提交和质量评估。

```mermaid
sequenceDiagram
participant 前端
participant answerAPI
participant assessAPI
participant 数据库
participant LLM
前端->>answerAPI : POST /api/interview/answer {session_id, question_id, answer}
answerAPI->>answerAPI : 验证用户身份和权限
answerAPI->>数据库 : 验证会话和题目存在性
数据库-->>answerAPI : 返回验证结果
answerAPI->>assessAPI : 调用评估逻辑
assessAPI->>LLM : 提供问题、JD和答案
LLM-->>assessAPI : 返回评估结果
assessAPI-->>answerAPI : 返回评估数据
answerAPI->>数据库 : 保存答案和评估结果
数据库-->>answerAPI : 确认保存
answerAPI->>前端 : 返回评估结果
```

**图示来源**
- [app/api/interview/answer/route.ts](file://app/api/interview/answer/route.ts)
- [app/api/interview/assess/route.ts](file://app/api/interview/assess/route.ts)

### 面试总结生成

面试完成后，系统通过`complete`和`summary`接口生成综合评估报告。

```mermaid
flowchart TD
A[前端] --> B[complete API]
B --> C{验证会话权限}
C --> |通过| D[查询所有答案评估]
D --> E[调用summarizeInterview]
E --> F[LLM生成综合报告]
F --> G[返回结构化总结]
G --> H[前端展示报告]
I[前端] --> J[summary API]
J --> K{验证会话权限}
K --> |通过| L[查询评估结果]
L --> M[调用summarizeInterview]
M --> N[返回总结数据]
N --> O[前端展示报告]
```

**图示来源**
- [app/api/interview/complete/route.ts](file://app/api/interview/complete/route.ts)
- [app/api/interview/summary/route.ts](file://app/api/interview/summary/route.ts)

## 状态管理机制

### 白板数据持久化

系统通过`save-whiteboard`和`load-whiteboard`接口实现白板数据的实时同步和持久化存储。

```mermaid
sequenceDiagram
participant 前端
participant saveAPI
participant loadAPI
participant 数据库
前端->>saveAPI : POST /api/save-whiteboard {data}
saveAPI->>saveAPI : 验证用户身份
saveAPI->>数据库 : upsert whiteboard_states记录
数据库-->>saveAPI : 确认保存
saveAPI->>前端 : 返回成功响应
前端->>loadAPI : POST /api/load-whiteboard
loadAPI->>loadAPI : 验证用户身份
loadAPI->>数据库 : 查询whiteboard_states
数据库-->>loadAPI : 返回白板数据
loadAPI->>前端 : 返回数据或空对象
```

**图示来源**
- [app/api/save-whiteboard/route.ts](file://app/api/save-whiteboard/route.ts)
- [app/api/load-whiteboard/route.ts](file://app/api/load-whiteboard/route.ts)

## 安全与错误处理

### 安全防护机制

系统实施多层安全防护，防止恶意请求和数据泄露。

```mermaid
flowchart TD
A[请求到达] --> B{包含apiKey/token?}
B --> |是| C[拒绝请求400]
B --> |否| D{路径需要认证?}
D --> |是| E[验证用户会话]
E --> F{认证通过?}
F --> |否| G[返回401]
F --> |是| H[继续处理]
D --> |否| H
H --> I[验证请求参数]
I --> J{参数有效?}
J --> |否| K[返回400]
J --> |是| L[执行业务逻辑]
```

**图示来源**
- [app/api/auth/create-session/route.ts](file://app/api/auth/create-session/route.ts)
- [app/api/parse-resume/route.ts](file://app/api/parse-resume/route.ts)

### 错误处理策略

系统采用统一的错误处理模式，确保API响应的一致性和可预测性。

```mermaid
sequenceDiagram
participant API
participant 错误处理器
participant 日志系统
API->>API : 执行业务逻辑
API->>错误处理器 : 捕获异常
错误处理器->>日志系统 : 记录错误详情
日志系统-->>错误处理器 : 确认记录
错误处理器->>API : 返回标准化错误响应
API->>前端 : 返回500或其他状态码
```

**图示来源**
- [app/api/interview/start/route.ts](file://app/api/interview/start/route.ts)
- [app/api/resume/upload/route.ts](file://app/api/resume/upload/route.ts)

## API调用示例与测试

### 核心API调用示例

以下是关键API接口的调用示例，可用于测试和集成。

```typescript
// 创建会话
async function createSession(inviteCode: string) {
  const response = await fetch('/api/auth/create-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteCode })
  });
  return await response.json();
}

// 上传简历
async function uploadResume(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('/api/resume/upload', {
    method: 'POST',
    body: formData
  });
  return await response.json();
}

// 开始面试
async function startInterview(jd: string, roundType: string) {
  const response = await fetch('/api/interview/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jd, roundType, questionCount: 5 })
  });
  return await response.json();
}
```

**代码来源**
- [app/api/README.md](file://app/api/README.md)

## 性能优化建议

### 数据库查询优化

- 为常用查询字段创建索引，如`user_resumes.user_id`、`interview_sessions.user_id`
- 使用批量操作减少数据库往返次数
- 实现查询结果缓存，避免重复计算

### LLM调用优化

- 实现LLM响应缓存，避免重复请求相同内容
- 使用流式响应减少用户等待时间
- 优化提示词工程，提高首次响应准确率

### 文件处理优化

- 实现文件上传进度跟踪
- 添加文件大小限制和类型验证
- 使用CDN加速文件访问

### 并发控制

- 实现API请求节流，防止滥用
- 使用分布式锁处理并发修改
- 监控API响应时间，及时发现性能瓶颈