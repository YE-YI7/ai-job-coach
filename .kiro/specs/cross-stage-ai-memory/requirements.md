# 跨阶段AI记忆共享系统 - 需求文档

## 简介
实现跨阶段的AI记忆共享系统，让用户在不同求职阶段（职业规划、项目梳理、简历优化、投递策略、面试准备、薪资谈判、Offer选择）之间切换时，AI能够记住并利用之前阶段的关键信息，提供更个性化和连贯的指导。

## 术语表
- **Stage（阶段）**: 用户当前所处的求职阶段（career, project, resume, delivery, interview, salary, offer）
- **Memory（记忆）**: AI从对话中提取的关键信息摘要
- **Context（上下文）**: 传递给AI的历史信息，包括记忆和最近的对话
- **Summarization（总结）**: 当对话内容过多时，AI自动提取关键信息的过程

## 需求

### 需求 1: 跨阶段记忆存储

**用户故事**: 作为用户，我希望AI能记住我在不同阶段的关键信息，这样我在切换阶段时不需要重复说明。

#### 验收标准
1. WHEN 用户在某个阶段进行对话 THEN 系统应自动提取并存储关键记忆
2. WHEN 用户切换到新阶段 THEN 系统应能访问之前阶段的记忆
3. WHEN 记忆内容过多（超过阈值）THEN 系统应自动总结压缩记忆
4. THE 系统应为每个用户维护独立的记忆存储

### 需求 2: 智能记忆提取

**用户故事**: 作为系统，我需要从对话中智能提取关键信息，避免存储无关内容。

#### 验收标准
1. WHEN 对话包含用户的职业目标 THEN 系统应提取并存储该信息
2. WHEN 对话包含项目经历细节 THEN 系统应提取STAR格式的关键点
3. WHEN 对话包含技能和优势 THEN 系统应提取并分类存储
4. WHEN 对话包含求职偏好 THEN 系统应提取地点、薪资、公司类型等信息
5. THE 系统应过滤掉闲聊和无关内容

### 需求 3: 记忆自动总结

**用户故事**: 作为系统，当记忆内容过多时，我需要自动总结压缩，保持上下文窗口在合理范围内。

#### 验收标准
1. WHEN 某个阶段的对话消息数超过20条 THEN 系统应触发自动总结
2. WHEN 总结完成 THEN 系统应保留最新的5条消息和总结后的记忆
3. WHEN 总结完成 THEN 系统应标记原始消息为"已总结"状态
4. THE 总结应保留所有关键信息，不丢失重要细节

### 需求 4: 跨阶段上下文注入

**用户故事**: 作为AI，我需要在回复用户时能够访问其他阶段的记忆，提供连贯的指导。

#### 验收标准
1. WHEN AI在当前阶段回复用户 THEN 系统应注入相关的跨阶段记忆
2. WHEN 注入记忆 THEN 系统应优先注入与当前阶段相关的记忆
3. WHEN 注入记忆 THEN 系统应控制总上下文长度在token限制内
4. THE 记忆注入应对用户透明，不影响对话体验

### 需求 5: 记忆查询和管理

**用户故事**: 作为用户，我希望能够查看AI记住了哪些关于我的信息。

#### 验收标准
1. WHEN 用户请求查看记忆 THEN 系统应展示所有阶段的关键记忆
2. WHEN 用户请求删除某条记忆 THEN 系统应支持删除操作
3. WHEN 用户请求重置所有记忆 THEN 系统应支持清空操作
4. THE 记忆展示应按阶段分类，易于理解

### 需求 6: 面试阶段特殊处理

**用户故事**: 作为面试准备阶段的AI，我需要访问职业规划、项目梳理、简历优化阶段的记忆，生成个性化的面试题。

#### 验收标准
1. WHEN 用户开始面试准备 THEN 系统应汇总职业目标、项目经历、技能优势
2. WHEN 生成面试题 THEN 系统应基于用户的实际经历和目标岗位
3. WHEN 用户回答面试题 THEN 系统应结合用户的项目经历给出评价
4. THE 面试题应具有高度个性化，避免通用题目

### 需求 7: 数据库表设计

**用户故事**: 作为系统，我需要合适的数据库表结构来存储和管理跨阶段记忆。

#### 验收标准
1. THE 系统应有 `user_memories` 表存储记忆摘要
2. THE 系统应有 `memory_summaries` 表存储自动总结的历史
3. THE 系统应在 `conversation_messages` 表中标记消息的总结状态
4. THE 系统应支持按用户ID、阶段、时间范围查询记忆

### 需求 8: 性能和可扩展性

**用户故事**: 作为系统，我需要确保记忆系统高效运行，不影响对话响应速度。

#### 验收标准
1. WHEN 查询记忆 THEN 响应时间应小于200ms
2. WHEN 总结记忆 THEN 应异步执行，不阻塞用户对话
3. WHEN 注入上下文 THEN 应控制在4000 tokens以内
4. THE 系统应支持缓存常用记忆，减少数据库查询

## 数据模型

### user_memories 表
```sql
CREATE TABLE user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL, -- career, project, resume, delivery, interview, salary, offer
  memory_type TEXT NOT NULL, -- career_goal, project_detail, skill, preference, etc.
  content JSONB NOT NULL, -- 结构化的记忆内容
  importance INTEGER DEFAULT 5, -- 1-10，重要性评分
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_user_memories_user_stage ON user_memories(user_id, stage);
CREATE INDEX idx_user_memories_importance ON user_memories(importance DESC);
```

### memory_summaries 表
```sql
CREATE TABLE memory_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  summary_content TEXT NOT NULL, -- AI生成的总结文本
  message_count INTEGER NOT NULL, -- 总结了多少条消息
  token_count INTEGER, -- 总结后的token数
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memory_summaries_user_stage ON memory_summaries(user_id, stage);
```

### conversation_messages 表更新
```sql
-- 添加字段
ALTER TABLE conversation_messages 
ADD COLUMN is_summarized BOOLEAN DEFAULT FALSE,
ADD COLUMN summary_id UUID REFERENCES memory_summaries(id);
```

## 技术方案

### 记忆提取流程
1. 用户发送消息 → AI回复
2. 后台异步调用LLM提取关键信息
3. 将提取的信息结构化存储到 `user_memories` 表
4. 更新记忆的重要性评分

### 记忆总结流程
1. 检测某阶段消息数是否超过阈值（20条）
2. 触发总结任务（异步）
3. 调用LLM总结最近的对话
4. 存储总结到 `memory_summaries` 表
5. 标记原始消息为已总结
6. 可选：删除或归档已总结的消息

### 上下文注入流程
1. 用户在当前阶段发送消息
2. 查询当前阶段的最近5条消息
3. 查询跨阶段的关键记忆（按重要性排序）
4. 查询最新的记忆总结
5. 组装上下文：系统prompt + 记忆总结 + 跨阶段记忆 + 最近消息
6. 控制总token数在限制内
7. 调用LLM生成回复

## 优先级
1. P0: 数据库表创建和基础CRUD操作
2. P0: 跨阶段记忆查询和注入
3. P1: 智能记忆提取
4. P1: 自动记忆总结
5. P2: 用户记忆管理界面
6. P2: 性能优化和缓存

## 非功能需求
- 记忆提取准确率 > 85%
- 总结保留关键信息完整度 > 90%
- 上下文注入延迟 < 200ms
- 支持至少1000个并发用户
