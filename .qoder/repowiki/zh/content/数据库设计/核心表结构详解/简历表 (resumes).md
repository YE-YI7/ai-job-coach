# 简历表 (resumes)

<cite>
**本文档引用的文件**  
- [schema.sql](file://mysql/schema.sql#L68-L81)
- [parse-resume/route.ts](file://app/api/parse-resume/route.ts)
- [lib/db.ts](file://lib/db.ts#L292-L325)
- [parse_resume.ts](file://lib/chains/parse_resume.ts)
- [resume-editor/page.tsx](file://app/chat/resume-editor/page.tsx)
</cite>

## 目录
1. [简介](#简介)
2. [简历表结构与字段设计](#简历表结构与字段设计)
3. [外键约束与数据完整性](#外键约束与数据完整性)
4. [简历上传与解析流程](#简历上传与解析流程)
5. [parsed_data JSON 字段结构分析](#parsed_data-json-字段结构分析)
6. [在简历编辑器中的应用](#在简历编辑器中的应用)
7. [结论](#结论)

## 简介
`resumes` 表是 AI 求职教练系统中用于存储用户简历数据的核心表。它不仅保存原始简历文本，还通过结构化 JSON 数据支持 AI 分析与优化建议生成。该表在简历上传、内容提取和编辑渲染等关键功能中起着桥梁作用。

## 简历表结构与字段设计

`resumes` 表定义如下：

```sql
CREATE TABLE IF NOT EXISTS resumes (
  id VARCHAR(36) PRIMARY KEY COMMENT '简历ID（UUID）',
  user_id VARCHAR(20) NOT NULL COMMENT '用户邀请码',
  session_id VARCHAR(36) COMMENT '会话ID',
  raw_text TEXT COMMENT '原始文本',
  parsed_data JSON COMMENT '解析后的结构化数据',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  FOREIGN KEY (user_id) REFERENCES users(invite_code) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_session_id (session_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='简历表';
```

各字段设计逻辑如下：

- **id**：唯一标识每份简历，使用 UUID 避免冲突。
- **user_id**：关联用户，确保简历归属清晰。
- **session_id**：可选字段，记录简历创建时的会话上下文。
- **raw_text**：存储从 PDF 或 Word 文件中提取的原始文本内容，用于后续 AI 分析或重新解析。
- **parsed_data**：以 JSON 格式存储结构化简历信息，便于程序化访问和前端渲染。

**字段设计优势**：
- `raw_text` 保留原始信息，支持多次解析尝试。
- `parsed_data` 提供标准化数据接口，便于前后端交互。
- 使用 `VARCHAR(36)` 存储 UUID，兼容通用性与性能。

**Section sources**
- [schema.sql](file://mysql/schema.sql#L68-L81)

## 外键约束与数据完整性

`resumes` 表通过两个外键维护数据一致性：

```sql
FOREIGN KEY (user_id) REFERENCES users(invite_code) ON DELETE CASCADE,
FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
```

### 外键作用说明

| 外键 | 引用目标 | 删除策略 | 说明 |
|------|----------|----------|------|
| user_id | users.invite_code | CASCADE | 用户删除时，其所有简历一并删除 |
| session_id | sessions.id | SET NULL | 会话过期或删除时，简历仍保留但会话ID置空 |

### 策略差异分析

- **ON DELETE CASCADE**：适用于强依赖关系。用户是简历的拥有者，一旦用户注销账户，其所有数据（包括简历）应被清除，符合数据隐私规范。
- **ON DELETE SET NULL**：适用于弱依赖关系。会话具有临时性，可能因超时或清理而失效，但简历作为长期资产应保留，仅解除与特定会话的绑定。

这种混合策略既保证了用户数据的整体一致性，又避免了因临时会话失效导致核心数据丢失的风险。

**Section sources**
- [schema.sql](file://mysql/schema.sql#L76-L77)

## 简历上传与解析流程

简历管理功能涉及多个 API 和服务的链式调用，完整流程如下：

### 1. 简历上传 (`/api/resume/upload`)

用户上传简历文件后：
- 文件被存储至 Supabase Storage
- 文件元信息（如 URL、原始文件名）写入 `user_resumes` 表
- 此时 `parsed_data` 为空，状态为 "uploaded"

### 2. 简历解析 (`/api/parse-resume`)

调用 `/api/parse-resume` 接口触发解析：
- 从 Supabase 下载文件
- 使用 `pdf-parse` 或 `mammoth` 提取文本
- 调用 LLM（如 DeepSeek）将文本转换为结构化 JSON
- 返回 `rawText` 和 `parsed` 数据

### 3. 数据持久化 (`lib/db.ts`)

通过 `saveResume()` 函数将解析结果写入 `resumes` 表：

```ts
export async function saveResume(
  userId: string,
  sessionId: string,
  resumeData: {
    rawText: string;
    parsed: any;
  }
): Promise<string> {
  const client = await getDbClient();
  const resumeId = uuidv4();

  await client.from('resumes').insert({
    id: resumeId,
    user_id: userId,
    session_id: sessionId,
    raw_text: resumeData.rawText,
    parsed_data: resumeData.parsed,
    created_at: new Date().toISOString(),
  });

  return resumeId;
}
```

该流程实现了从文件上传到结构化数据存储的端到端自动化。

**Section sources**
- [parse-resume/route.ts](file://app/api/parse-resume/route.ts)
- [lib/db.ts](file://lib/db.ts#L292-L325)

## parsed_data JSON 字段结构分析

`parsed_data` 字段存储由 AI 解析生成的结构化简历信息，其典型结构如下：

```json
{
  "summary": "个人简介",
  "skills": ["JavaScript", "React"],
  "education": [
    {
      "school": "清华大学",
      "degree": "硕士",
      "time": "2018-2022",
      "text": "计算机科学与技术专业"
    }
  ],
  "experiences": [
    {
      "company": "腾讯",
      "title": "前端工程师",
      "time": "2022-至今",
      "text": "负责XX项目开发"
    }
  ],
  "projects": [
    {
      "title": "AI简历优化器",
      "role": "负责人",
      "start": "2023-01",
      "end": "2023-12",
      "text": "基于LLM的简历分析系统"
    }
  ]
}
```

### 结构化字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| summary | string | 个人简介摘要，50-100字 |
| skills | array | 技能列表，用于技能匹配分析 |
| education | array | 教育经历，包含学校、学位、时间等 |
| experiences | array | 工作/实习经历，支持多段 |
| projects | array | 项目经历，强调成果与角色 |

该结构设计便于前端组件按模块渲染，并支持 AI 进行针对性优化建议生成。

**Section sources**
- [parse-resume/route.ts](file://app/api/parse-resume/route.ts#L80-L110)

## 在简历编辑器中的应用

`resumes` 表的数据最终服务于 `ResumeEditor` 组件，实现简历的可视化编辑与优化。

### 数据流路径

1. 用户进入 `/chat/resume-editor`
2. 前端尝试从 `localStorage` 或数据库加载简历数据
3. 若存在 `parsed_data`，则自动填充至各编辑分区
4. 用户可手动编辑或点击“AI优化”按钮获取建议
5. 编辑结果实时预览，并可导出为文本文件

### 编辑器功能集成

- **分区编辑**：将 `parsed_data` 拆分为“教育信息”、“项目经历”等独立区块
- **AI优化**：调用 `/api/chat` 接口，传入当前内容请求优化建议
- **预览同步**：点击“应用”按钮后，内容同步至右侧预览区
- **本地持久化**：编辑状态保存至 `localStorage`，防止意外丢失

尽管当前编辑器主要依赖本地存储，但 `resumes` 表提供了可靠的云端数据源，确保用户在不同设备间切换时仍能恢复进度。

**Section sources**
- [resume-editor/page.tsx](file://app/chat/resume-editor/page.tsx)

## 结论
`resumes` 表作为简历管理功能的核心，通过合理的字段设计、外键约束和 JSON 结构化存储，有效支撑了从文件上传、内容解析到 AI 优化的完整工作流。其与 `parse-resume` API 和 `ResumeEditor` 的深度集成，体现了系统在数据一致性、功能扩展性和用户体验之间的良好平衡。未来可进一步增强 `parsed_data` 的 schema 验证，提升数据可靠性。