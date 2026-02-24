-- 跨阶段AI记忆共享系统 - 数据库迁移脚本
-- 创建日期: 2025-01-03

-- ==================== 1. 创建 user_memories 表 ====================
-- 存储从对话中提取的关键记忆
CREATE TABLE IF NOT EXISTS user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('career', 'project', 'resume', 'delivery', 'interview', 'salary', 'offer')),
  memory_type TEXT NOT NULL, -- career_goal, project_detail, skill, preference, company_target, etc.
  content JSONB NOT NULL, -- 结构化的记忆内容
  importance INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10), -- 1-10，重要性评分
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_memories_user_stage ON user_memories(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_user_memories_user_active ON user_memories(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_memories_importance ON user_memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_user_memories_type ON user_memories(memory_type);

-- 添加注释
COMMENT ON TABLE user_memories IS '用户跨阶段记忆存储表';
COMMENT ON COLUMN user_memories.stage IS '记忆所属阶段: career, project, resume, delivery, interview, salary, offer';
COMMENT ON COLUMN user_memories.memory_type IS '记忆类型: career_goal, project_detail, skill, preference等';
COMMENT ON COLUMN user_memories.content IS '结构化的记忆内容（JSONB格式）';
COMMENT ON COLUMN user_memories.importance IS '重要性评分（1-10），用于上下文注入时的优先级排序';

-- ==================== 2. 创建 memory_summaries 表 ====================
-- 存储AI自动总结的对话摘要
CREATE TABLE IF NOT EXISTS memory_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('career', 'project', 'resume', 'delivery', 'interview', 'salary', 'offer')),
  summary_content TEXT NOT NULL, -- AI生成的总结文本
  message_count INTEGER NOT NULL DEFAULT 0, -- 总结了多少条消息
  token_count INTEGER, -- 总结后的token数（可选）
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_memory_summaries_user_stage ON memory_summaries(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_memory_summaries_created ON memory_summaries(created_at DESC);

-- 添加注释
COMMENT ON TABLE memory_summaries IS 'AI自动总结的对话摘要表';
COMMENT ON COLUMN memory_summaries.summary_content IS 'AI生成的总结文本';
COMMENT ON COLUMN memory_summaries.message_count IS '本次总结包含的消息数量';
COMMENT ON COLUMN memory_summaries.token_count IS '总结文本的token数量';

-- ==================== 3. 更新 conversation_messages 表 ====================
-- 添加总结相关字段
DO $$ 
BEGIN
  -- 添加 is_summarized 字段（如果不存在）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation_messages' AND column_name = 'is_summarized'
  ) THEN
    ALTER TABLE conversation_messages ADD COLUMN is_summarized BOOLEAN DEFAULT FALSE;
  END IF;

  -- 添加 summary_id 字段（如果不存在）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation_messages' AND column_name = 'summary_id'
  ) THEN
    ALTER TABLE conversation_messages ADD COLUMN summary_id UUID REFERENCES memory_summaries(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_conversation_messages_summarized ON conversation_messages(is_summarized);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_summary_id ON conversation_messages(summary_id);

-- 添加注释
COMMENT ON COLUMN conversation_messages.is_summarized IS '该消息是否已被总结';
COMMENT ON COLUMN conversation_messages.summary_id IS '关联的总结ID';

-- ==================== 4. 创建辅助函数 ====================

-- 函数：获取用户在某个阶段的活跃记忆数量
CREATE OR REPLACE FUNCTION get_active_memory_count(p_user_id UUID, p_stage TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM user_memories
    WHERE user_id = p_user_id
      AND stage = p_stage
      AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql;

-- 函数：获取用户在某个阶段的未总结消息数量
CREATE OR REPLACE FUNCTION get_unsummarized_message_count(p_user_id UUID, p_stage TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM conversation_messages
    WHERE user_id = p_user_id
      AND stage = p_stage
      AND is_summarized = FALSE
  );
END;
$$ LANGUAGE plpgsql;

-- 函数：更新记忆的 updated_at 时间戳
CREATE OR REPLACE FUNCTION update_memory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器：自动更新 user_memories 的 updated_at
DROP TRIGGER IF EXISTS trigger_update_memory_timestamp ON user_memories;
CREATE TRIGGER trigger_update_memory_timestamp
  BEFORE UPDATE ON user_memories
  FOR EACH ROW
  EXECUTE FUNCTION update_memory_timestamp();

-- ==================== 5. 插入示例数据（可选，用于测试） ====================

-- 注意：这部分仅用于开发测试，生产环境请注释掉

-- 示例：为测试用户创建一些记忆
-- INSERT INTO user_memories (user_id, stage, memory_type, content, importance) VALUES
-- ('00000000-0000-0000-0000-000000000001', 'career', 'career_goal', '{"target_role": "Java后端开发工程师", "target_industry": "互联网", "target_location": "北京"}', 9),
-- ('00000000-0000-0000-0000-000000000001', 'project', 'project_detail', '{"project_name": "电商平台", "role": "后端开发", "tech_stack": ["Java", "Spring Boot", "MySQL"], "achievements": ["优化查询性能提升50%", "设计分布式缓存方案"]}', 8);

-- ==================== 6. 权限设置（如果需要） ====================

-- 如果使用 RLS (Row Level Security)，可以添加策略
-- ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE memory_summaries ENABLE ROW LEVEL SECURITY;

-- 示例策略：用户只能访问自己的记忆
-- CREATE POLICY user_memories_policy ON user_memories
--   FOR ALL
--   USING (user_id = auth.uid());

-- CREATE POLICY memory_summaries_policy ON memory_summaries
--   FOR ALL
--   USING (user_id = auth.uid());

-- ==================== 7. 验证脚本 ====================

-- 验证表是否创建成功
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_name IN ('user_memories', 'memory_summaries');
  
  IF table_count = 2 THEN
    RAISE NOTICE '✓ 所有表创建成功';
  ELSE
    RAISE WARNING '⚠ 部分表创建失败，请检查';
  END IF;
END $$;

-- 验证索引是否创建成功
DO $$
DECLARE
  index_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE tablename IN ('user_memories', 'memory_summaries', 'conversation_messages')
    AND indexname LIKE 'idx_%memory%';
  
  RAISE NOTICE '✓ 创建了 % 个相关索引', index_count;
END $$;

-- ==================== 完成 ====================
-- 迁移脚本执行完成
-- 下一步：在应用代码中实现记忆提取、总结和注入逻辑
