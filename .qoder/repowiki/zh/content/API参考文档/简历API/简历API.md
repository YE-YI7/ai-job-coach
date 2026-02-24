# 简历API

<cite>
**本文档中引用的文件**  
- [upload/route.ts](file://app/api/resume/upload/route.ts)
- [parse/route.ts](file://app/api/resume/parse/route.ts)
- [parse-resume/route.ts](file://app/api/parse-resume/route.ts)
- [ResumeUploadBox.tsx](file://components/resume/ResumeUploadBox.tsx)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构概述](#架构概述)
5. [详细组件分析](#详细组件分析)
6. [依赖分析](#依赖分析)
7. [性能考虑](#性能考虑)
8. [故障排除指南](#故障排除指南)
9. [结论](#结论)

## 简介
本项目是一个AI求职教练系统，提供简历上传、解析、删除和内容提取等核心功能。API基于Next.js构建，通过Supabase存储文件，并利用pdf-parse和mammoth库处理PDF和DOCX格式的简历文件。系统支持结构化数据提取，前端组件提供用户友好的上传界面。

## 项目结构

```mermaid
graph TD
subgraph "API 路由"
A[/api/resume/upload]
B[/api/resume/parse]
C[/api/resume/delete{resume_id}]
D[/api/parse-resume]
end
subgraph "前端组件"
E[ResumeUploadBox.tsx]
end
subgraph "后端服务"
F[pdf-parse]
G[mammoth]
H[Supabase Storage]
I[PostgreSQL]
end
E --> A
A --> H
B --> I
C --> I
D --> F
D --> G
```

**图示来源**
- [upload/route.ts](file://app/api/resume/upload/route.ts#L1-L140)
- [parse/route.ts](file://app/api/resume/parse/route.ts#L1-L228)
- [parse-resume/route.ts](file://app/api/parse-resume/route.ts#L1-L196)
- [ResumeUploadBox.tsx](file://components/resume/ResumeUploadBox.tsx#L1-L56)

**本节来源**
- [app/api/resume](file://app/api/resume)

## 核心组件

简历处理系统包含四个主要API端点：上传、解析、删除和内容提取。上传接口处理multipart/form-data格式的文件上传，支持PDF、DOC和DOCX格式。解析接口从Supabase下载文件并提取纯文本内容。内容提取接口使用LLM将简历文本转换为结构化JSON数据。删除接口实现权限控制和数据库级联删除。

**本节来源**
- [upload/route.ts](file://app/api/resume/upload/route.ts#L12-L139)
- [parse/route.ts](file://app/api/resume/parse/route.ts#L99-L228)
- [parse-resume/route.ts](file://app/api/parse-resume/route.ts#L12-L196)

## 架构概述

```mermaid
sequenceDiagram
participant 前端 as 前端(ResumeUploadBox)
participant 上传API as /api/resume/upload
participant 存储 as Supabase Storage
participant 数据库 as PostgreSQL
participant 解析API as /api/resume/parse
participant 内容提取API as /api/parse-resume
前端->>上传API : POST multipart/form-data
上传API->>存储 : 上传文件
上传API->>数据库 : 插入记录
上传API-->>前端 : 返回resume_id
前端->>解析API : POST {resume_id}
解析API->>数据库 : 查询文件URL
解析API->>存储 : 下载文件
解析API->>解析库 : 解析PDF/DOCX
解析API->>数据库 : 更新parsed_text
解析API-->>前端 : 返回解析文本
前端->>内容提取API : POST formData(file)
内容提取API->>pdf-parse : 解析PDF
内容提取API->>LLM : 结构化提取
内容提取API-->>前端 : 返回JSON结构
前端->>删除API : DELETE /delete/{resume_id}
删除API->>数据库 : 验证权限并删除
删除API-->>前端 : 返回结果
```

**图示来源**
- [upload/route.ts](file://app/api/resume/upload/route.ts#L12-L139)
- [parse/route.ts](file://app/api/resume/parse/route.ts#L99-L228)
- [parse-resume/route.ts](file://app/api/parse-resume/route.ts#L12-L196)
- [ResumeUploadBox.tsx](file://components/resume/ResumeUploadBox.tsx#L1-L56)

## 详细组件分析

### 上传接口分析

```mermaid
flowchart TD
A[开始] --> B[认证检查]
B --> C{已认证?}
C --> |否| D[返回401]
C --> |是| E[解析multipart/form-data]
E --> F{文件存在?}
F --> |否| G[返回400]
F --> |是| H[验证文件扩展名]
H --> I{支持的格式?}
I --> |否| J[返回400]
I --> |是| K[读取文件缓冲区]
K --> L[上传到Supabase]
L --> M{上传成功?}
M --> |否| N[返回500]
M --> |是| O[写入数据库]
O --> P[清理临时文件]
P --> Q[返回resume_id]
```

**图示来源**
- [upload/route.ts](file://app/api/resume/upload/route.ts#L12-L139)

**本节来源**
- [upload/route.ts](file://app/api/resume/upload/route.ts#L12-L139)

### 解析接口分析

```mermaid
flowchart TD
A[开始] --> B[认证检查]
B --> C{已认证?}
C --> |否| D[返回401]
C --> |是| E[解析请求体]
E --> F{包含resume_id?}
F --> |否| G[返回400]
F --> |是| H[查询数据库]
H --> I{简历存在?}
I --> |否| J[返回404]
I --> |是| K[验证所有权]
K --> L{有权访问?}
L --> |否| M[返回403]
L --> |是| N[下载文件]
N --> O{下载成功?}
O --> |否| P[返回500]
O --> |是| Q[解析文件内容]
Q --> R{解析成功?}
R --> |否| S[返回400]
R --> |是| T[更新数据库]
T --> U[返回解析文本]
```

**图示来源**
- [parse/route.ts](file://app/api/resume/parse/route.ts#L99-L228)

**本节来源**
- [parse/route.ts](file://app/api/resume/parse/route.ts#L99-L228)

### 内容提取接口分析

```mermaid
classDiagram
class ParseResumeAPI {
+POST(request : Request)
-validateFile(file : File)
-extractPDFText(buffer : Buffer)
-callLLM(prompt : string)
-parseLLMResponse(response : string)
}
class PDFParser {
+pdfParse(buffer : Buffer)
-extractText(data : any)
}
class LLMService {
+callLLM(messages, options)
-validateResponse(response)
}
ParseResumeAPI --> PDFParser : 使用
ParseResumeAPI --> LLMService : 调用
ParseResumeAPI --> ParseResumeAPI : 处理流程
```

**图示来源**
- [parse-resume/route.ts](file://app/api/parse-resume/route.ts#L12-L196)

**本节来源**
- [parse-resume/route.ts](file://app/api/parse-resume/route.ts#L12-L196)

### 前端组件分析

```mermaid
flowchart TD
A[ResumeUploadBox] --> B[渲染上传区域]
B --> C{用户点击?}
C --> |是| D[触发文件选择]
D --> E{文件被选择?}
E --> |是| F[调用onSelect回调]
F --> G[重置输入]
E --> |否| H[无操作]
```

**图示来源**
- [ResumeUploadBox.tsx](file://components/resume/ResumeUploadBox.tsx#L1-L56)

**本节来源**
- [ResumeUploadBox.tsx](file://components/resume/ResumeUploadBox.tsx#L1-L56)

## 依赖分析

```mermaid
graph LR
A[简历API] --> B[pdf-parse]
A --> C[mammoth]
A --> D[Supabase]
A --> E[PostgreSQL]
A --> F[Next.js]
B --> G[PDF解析]
C --> H[DOCX解析]
D --> I[文件存储]
E --> J[数据持久化]
F --> K[API路由]
```

**图示来源**
- [upload/route.ts](file://app/api/resume/upload/route.ts#L4-L6)
- [parse/route.ts](file://app/api/resume/parse/route.ts#L5-L6)
- [parse-resume/route.ts](file://app/api/parse-resume/route.ts#L3-L4)

**本节来源**
- [upload/route.ts](file://app/api/resume/upload/route.ts#L1-L140)
- [parse/route.ts](file://app/api/resume/parse/route.ts#L1-L228)
- [parse-resume/route.ts](file://app/api/parse-resume/route.ts#L1-L196)

## 性能考虑
对于大文件上传，建议在服务器配置中设置适当的超时时间。Supabase存储的上传超时默认为30秒，对于大于5MB的文件可能需要调整。建议前端实现上传进度显示，并设置合理的文件大小限制（当前为10MB）。解析大型PDF文件时，pdf-parse库的性能与文件复杂度相关，建议对超过20页的简历进行优化处理。

## 故障排除指南
常见问题包括文件上传失败、解析错误和权限问题。上传失败通常与Supabase配置或网络问题有关。解析错误可能是由于文件损坏或格式不支持。权限问题通常出现在跨用户访问简历时。建议检查日志中的错误信息，并验证认证状态和文件URL的正确性。

## 结论
简历处理API提供了完整的文件上传、解析和管理功能。系统采用模块化设计，各组件职责清晰。通过Supabase实现可靠的文件存储，利用专业库处理不同格式的文档。前端组件提供简洁的用户界面，后端API实现安全的权限控制。整体架构可扩展，便于未来添加新的文件格式支持或增强解析功能。