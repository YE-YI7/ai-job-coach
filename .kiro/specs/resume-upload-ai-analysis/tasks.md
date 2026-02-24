# Implementation Plan: Resume Upload and AI Analysis

## Overview

本实现计划将简历上传并AI分析功能分解为一系列可执行的编码任务。每个任务都是独立的、可测试的步骤，按照从核心功能到集成的顺序组织。所有代码将使用TypeScript实现。

## Tasks

- [x] 1. 创建API端点和文件验证
  - 创建 `app/api/resume/upload/route.ts` 文件
  - 实现POST请求处理器，使用Node.js runtime
  - 实现文件类型验证（.pdf, .doc, .docx）
  - 实现文件大小验证（最大10MB）
  - 实现用户认证检查（使用getCurrentUserFromRequest）
  - 返回适当的错误响应（400, 401, 500）
  - _Requirements: 1.1, 1.2, 1.3, 5.1, 5.2, 5.5, 8.1, 8.2_

- [x] 1.1 编写文件验证的单元测试
  - 测试有效文件类型（.pdf, .docx）
  - 测试无效文件类型（.txt, .jpg）
  - 测试文件大小边界（10MB, 10MB+1）
  - 测试缺少文件的情况
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 1.2 编写文件类型验证的属性测试
  - **Property 1: File Type Validation**
  - **Validates: Requirements 1.1, 1.2**

- [x] 1.3 编写文件大小验证的属性测试
  - **Property 2: File Size Validation**
  - **Validates: Requirements 1.3**

- [x] 2. 实现文件内容提取服务
  - 在 `app/api/resume/upload/route.ts` 中实现PDF文本提取（使用pdf-parse）
  - 实现Word文档文本提取（使用mammoth）
  - 处理文件解析错误和空内容情况
  - 添加错误日志记录
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2.1 编写文本提取的单元测试
  - 测试PDF文本提取
  - 测试Word文档文本提取
  - 测试空文件处理
  - 测试损坏文件处理
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 2.2 编写文本提取成功的属性测试
  - **Property 3: Text Extraction Success**
  - **Validates: Requirements 2.1, 2.2, 2.4**

- [x] 3. 实现AI结构化解析服务
  - 在 `app/api/resume/upload/route.ts` 中实现AI解析函数
  - 使用callLLM函数调用DeepSeek API
  - 设计并实现AI提示词（参考design.md中的prompt）
  - 解析AI返回的JSON响应
  - 实现JSON清理和验证逻辑（移除markdown代码块标记）
  - 实现AI服务失败时的降级策略（返回基础结构）
  - 设置30秒超时
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3.1 编写AI解析的单元测试
  - 测试格式良好的简历文本
  - 测试最小信息的简历
  - 测试中英文混合内容
  - 测试AI超时处理
  - 测试JSON解析失败处理
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3.2 编写解析数据结构完整性的属性测试
  - **Property 4: Parsed Data Structure Completeness**
  - **Validates: Requirements 3.2, 3.5**

- [x] 3.3 编写AI解析降级的属性测试
  - **Property 9: AI Parsing Fallback**
  - **Validates: Requirements 3.3, 3.4**

- [x] 4. 实现数据库存储逻辑
  - 在 `lib/db.ts` 中添加 `saveResumeUpload` 函数
  - 实现事务性保存到resumes表
  - 实现保存到user_resumes表
  - 实现保存到resume_changes_log表（action_type: 'upload'）
  - 实现事务回滚机制（如果任何操作失败）
  - 使用UUID生成resume_id
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 4.1 编写数据库操作的单元测试
  - 测试成功保存到所有三个表
  - 测试事务回滚
  - 测试重复上传处理
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 4.2 编写数据库事务原子性的属性测试
  - **Property 5: Database Transaction Atomicity**
  - **Validates: Requirements 4.5**

- [x] 5. 完成API端点集成
  - 在 `app/api/resume/upload/route.ts` 中集成所有服务
  - 实现完整的请求处理流程：验证 → 提取 → 解析 → 保存 → 响应
  - 实现临时文件清理逻辑
  - 实现错误处理和日志记录
  - 返回完整的成功响应（resumeId, parsed, rawText, storageUrl）
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 5.1 编写API端点的集成测试
  - 测试完整的上传流程
  - 测试错误恢复流程
  - 测试临时文件清理
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 5.2 编写用户认证要求的属性测试
  - **Property 6: User Authentication Requirement**
  - **Validates: Requirements 5.5, 8.1**

- [x] 6. Checkpoint - 确保后端功能完整
  - 确保所有测试通过，如有问题请询问用户

- [x] 7. 实现前端上传组件
  - 在 `app/chat/resume-editor/page.tsx` 中添加文件上传按钮
  - 实现文件选择对话框
  - 实现拖拽上传区域（可选）
  - 实现上传进度指示器
  - 实现错误提示显示
  - _Requirements: 6.1, 6.2, 6.3, 6.5_

- [x] 8. 实现前端数据填充逻辑
  - 在 `app/chat/resume-editor/page.tsx` 中实现API调用
  - 解析API响应并提取parsed数据
  - 将parsed数据映射到各个编辑分区
  - 实现自动填充逻辑（summary → 个人评价, education → 教育信息, etc.）
  - 保留用户手动编辑的内容（提示用户是否覆盖）
  - _Requirements: 6.4, 6.6_

- [x] 8.1 编写前端集成的单元测试
  - 测试文件上传UI交互
  - 测试数据填充逻辑
  - 测试错误提示显示
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 9. 实现错误处理和用户反馈
  - 在前端实现所有错误类型的友好提示
  - 实现错误消息映射（API错误码 → 用户友好消息）
  - 添加重试按钮（对于网络错误）
  - 添加帮助提示（对于文件格式错误）
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 9.1 编写错误消息格式的属性测试
  - **Property 8: Error Message Clarity**
  - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**

- [x] 10. 实现安全性增强
  - 在API端点中添加MIME类型验证（不仅依赖扩展名）
  - 实现上传频率限制（每分钟最多3次）
  - 实现文件名清理（防止路径遍历）
  - 添加用户数据隔离检查
  - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 10.1 编写用户数据隔离的属性测试
  - **Property 7: User Data Isolation**
  - **Validates: Requirements 8.5**

- [x] 11. 性能优化
  - 实现流式文件上传处理
  - 优化数据库连接使用（使用现有的连接池）
  - 添加AI解析超时处理
  - 实现大文件的分块处理（如果需要）
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 11.1 编写性能测试
  - 测试小文件（<5MB）的处理时间
  - 测试超时处理
  - _Requirements: 9.1, 9.3_

- [x] 11.2 编写文件上传性能的属性测试
  - **Property 10: File Upload Performance**
  - **Validates: Requirements 9.1, 9.3**

- [x] 12. Final Checkpoint - 端到端测试
  - 上传真实的PDF简历，验证完整流程
  - 上传真实的Word简历，验证完整流程
  - 测试各种错误场景
  - 验证数据库记录正确性
  - 验证前端显示正确性
  - 确保所有测试通过，如有问题请询问用户

## Notes

- 所有任务都是必需的，包括单元测试和属性测试
- 每个任务都引用了具体的需求编号，便于追溯
- Checkpoint任务确保增量验证
- 属性测试验证通用正确性属性
- 单元测试验证具体示例和边界情况
- 使用TypeScript实现所有代码
- 使用现有的依赖库（pdf-parse, mammoth, callLLM, getDbClient等）
