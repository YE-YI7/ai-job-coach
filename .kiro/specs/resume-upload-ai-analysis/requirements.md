# Requirements Document

## Introduction

本文档定义了简历上传并AI分析功能的需求。该功能允许用户上传PDF或Word格式的简历文件，系统将自动解析文件内容，使用AI提取结构化信息，并将结果保存到数据库中供后续使用。

## Glossary

- **System**: 简历上传与AI分析系统
- **User**: 使用系统上传简历的用户
- **Resume_File**: 用户上传的PDF或Word格式的简历文件
- **Parsed_Data**: AI从简历中提取的结构化数据（包括个人信息、教育经历、工作经验、项目经历、技能等）
- **Storage_Service**: 文件存储服务（本地或云存储）
- **Database**: PostgreSQL数据库，包含resumes、user_resumes、resume_changes_log表
- **AI_Parser**: 使用LLM进行简历内容解析的服务

## Requirements

### Requirement 1: 文件上传

**User Story:** 作为用户，我想上传PDF或Word格式的简历文件，以便系统能够分析我的简历内容。

#### Acceptance Criteria

1. WHEN 用户选择一个文件 THEN THE System SHALL 验证文件格式是否为PDF或Word（.pdf, .doc, .docx）
2. WHEN 文件格式无效 THEN THE System SHALL 返回错误提示并拒绝上传
3. WHEN 文件大小超过10MB THEN THE System SHALL 返回错误提示并拒绝上传
4. WHEN 文件验证通过 THEN THE System SHALL 将文件保存到Storage_Service并返回文件URL
5. WHEN 文件保存失败 THEN THE System SHALL 返回错误信息并清理临时文件

### Requirement 2: 文件内容提取

**User Story:** 作为系统，我需要从上传的文件中提取文本内容，以便进行后续的AI分析。

#### Acceptance Criteria

1. WHEN 接收到PDF文件 THEN THE System SHALL 使用pdf-parse库提取文本内容
2. WHEN 接收到Word文件 THEN THE System SHALL 使用mammoth库提取文本内容
3. WHEN 文件内容为空或无法提取 THEN THE System SHALL 返回错误提示
4. WHEN 文本提取成功 THEN THE System SHALL 返回提取的原始文本内容
5. WHEN 文件解析过程中发生错误 THEN THE System SHALL 记录错误日志并返回友好的错误信息

### Requirement 3: AI结构化解析

**User Story:** 作为系统，我需要使用AI将简历文本解析为结构化数据，以便用户可以方便地编辑和使用。

#### Acceptance Criteria

1. WHEN 获得简历文本内容 THEN THE System SHALL 调用AI_Parser提取结构化信息
2. WHEN AI解析完成 THEN THE Parsed_Data SHALL 包含以下字段：summary（个人简介）、skills（技能列表）、education（教育经历数组）、experiences（工作经历数组）、projects（项目经历数组）
3. WHEN AI返回的数据格式不正确 THEN THE System SHALL 尝试修复或返回默认结构
4. WHEN AI服务不可用 THEN THE System SHALL 返回基础解析结果（仅包含原始文本）
5. WHEN 解析成功 THEN THE System SHALL 验证Parsed_Data的数据完整性

### Requirement 4: 数据库存储

**User Story:** 作为系统，我需要将解析后的简历数据保存到数据库，以便用户可以查看和管理他们的简历。

#### Acceptance Criteria

1. WHEN 简历解析成功 THEN THE System SHALL 在resumes表中创建新记录
2. WHEN 创建resumes记录 THEN THE System SHALL 包含user_id、filename、parsed（JSONB）、storage_url、active（默认true）字段
3. WHEN 创建resumes记录 THEN THE System SHALL 同时在user_resumes表中创建关联记录
4. WHEN 创建user_resumes记录 THEN THE System SHALL 包含user_id、session_id、original_file_url、parsed_text、status（'completed'）、parsed_meta（JSONB）字段
5. WHEN 数据库操作失败 THEN THE System SHALL 回滚事务并返回错误信息
6. WHEN 保存成功 THEN THE System SHALL 在resume_changes_log表中记录action_type为'upload'的日志

### Requirement 5: API端点实现

**User Story:** 作为前端开发者，我需要一个统一的API端点来处理简历上传和解析，以便集成到用户界面中。

#### Acceptance Criteria

1. THE System SHALL 提供POST /api/resume/upload端点接收文件上传
2. WHEN 调用/api/resume/upload THEN THE System SHALL 接受multipart/form-data格式的请求
3. WHEN 上传成功 THEN THE System SHALL 返回包含resume_id、parsed_data、storage_url的JSON响应
4. WHEN 上传失败 THEN THE System SHALL 返回包含error字段的JSON响应和适当的HTTP状态码
5. THE System SHALL 要求请求包含有效的用户认证信息

### Requirement 6: 前端集成

**User Story:** 作为用户，我想在简历编辑器页面上传我的简历文件，并看到AI解析后的结果自动填充到编辑器中。

#### Acceptance Criteria

1. WHEN 用户访问简历编辑器页面 THEN THE System SHALL 显示文件上传按钮
2. WHEN 用户点击上传按钮 THEN THE System SHALL 打开文件选择对话框
3. WHEN 用户选择文件并确认 THEN THE System SHALL 显示上传进度指示器
4. WHEN 上传和解析完成 THEN THE System SHALL 将Parsed_Data自动填充到对应的编辑分区
5. WHEN 上传失败 THEN THE System SHALL 显示错误提示信息
6. WHEN 解析完成 THEN THE System SHALL 允许用户编辑和优化填充的内容

### Requirement 7: 错误处理与用户反馈

**User Story:** 作为用户，当上传或解析过程中出现问题时，我想看到清晰的错误提示，以便我知道如何解决问题。

#### Acceptance Criteria

1. WHEN 文件格式不支持 THEN THE System SHALL 显示"仅支持PDF和Word格式文件"
2. WHEN 文件过大 THEN THE System SHALL 显示"文件大小不能超过10MB"
3. WHEN 文件内容无法提取 THEN THE System SHALL 显示"无法读取文件内容，请确保文件未损坏"
4. WHEN AI解析失败 THEN THE System SHALL 显示"AI解析失败，已保存原始文本"并允许用户手动编辑
5. WHEN 网络错误 THEN THE System SHALL 显示"网络连接失败，请检查网络后重试"
6. WHEN 服务器错误 THEN THE System SHALL 显示"服务器错误，请稍后重试"

### Requirement 8: 安全性

**User Story:** 作为系统管理员，我需要确保简历上传功能是安全的，防止恶意文件上传和未授权访问。

#### Acceptance Criteria

1. THE System SHALL 验证用户身份，仅允许已登录用户上传简历
2. THE System SHALL 验证文件MIME类型，不仅依赖文件扩展名
3. THE System SHALL 对上传的文件进行病毒扫描（如果可用）
4. THE System SHALL 限制每个用户的上传频率（例如：每分钟最多3次）
5. THE System SHALL 确保用户只能访问自己上传的简历数据
6. THE System SHALL 在存储文件时使用唯一的文件名，防止文件名冲突和路径遍历攻击

### Requirement 9: 性能优化

**User Story:** 作为用户，我希望简历上传和解析过程快速完成，以便我能够快速开始编辑。

#### Acceptance Criteria

1. WHEN 文件小于5MB THEN THE System SHALL 在10秒内完成上传和解析
2. THE System SHALL 使用流式处理大文件，避免内存溢出
3. THE System SHALL 对AI解析请求设置合理的超时时间（例如：30秒）
4. WHEN AI解析超时 THEN THE System SHALL 返回基础解析结果而不是完全失败
5. THE System SHALL 使用数据库连接池优化数据库操作性能
