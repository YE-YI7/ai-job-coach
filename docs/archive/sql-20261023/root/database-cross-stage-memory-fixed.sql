-- 跨阶段AI记忆共享系统 - 数据库迁移脚本（修复版）
-- 创建日期: 2025-01-03
-- 修复: 先创建 conversation_messages 表（如果不存在）

-- ==================== 0. 创建 conversation_messages 表（如果不存在） ====================
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  stage TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建基础索引
CREATE INDEX IF NOT EXISTS idx_conversation_messages_session ON conversation_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_user ON conversation_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_stage ON conversation_messages(stage);

-- ==================== 1. 创建 user_memories 表 ====================
CREATE TABLE IF NOT EXISTS user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('career', 'project', 'resume', 'delivery', 'interview', 'salary', 'offer')),
  memory_type TEXT NOT NULL,
  content JSONB NOT NULL,
  importance INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_user_memories_user_stage ON user_memories(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_user_memories_user_active ON user_memories(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_memories_importance ON user_memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_user_memories_type ON user_memories(memory_type);

COMMENT ON TABLE user_memories IS '用户跨阶段记忆存储表';
COMMENT ON COLUMN user_memories.stage IS '记忆所属阶段: career, project, resume, delivery, interview, salary, offer';
COMMENT ON COLUMN user_memories.memory_type IS '记忆类型: career_goal, project_detail, skill, preference等';
COMMENT ON COLUMN user_memories.content IS '结构化的记忆内容（JSONB格式）';
COMMENT ON COLUMN user_memories.importance IS '重要性评分（1-10），用于上下文注入时的优先级排序';

-- ==================== 2. 创建 memory_summaries 表 ====================
CREATE TABLE IF NOT EXISTS memory_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('career', 'project', 'resume', 'delivery', 'interview', 'salary', 'offer')),
  summary_content TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  token_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_summaries_user_stage ON memory_summaries(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_memory_summaries_created ON memory_summaries(created_at DESC);

COMMENT ON TABLE memory_summaries IS 'AI自动总结的对话摘要表';
COMMENT ON COLUMN memory_summaries.summary_content IS 'AI生成的总结文本';
COMMENT ON COLUMN memory_summaries.message_count IS '本次总结包含的消息数量';
COMMENT ON COLUMN memory_summaries.token_count IS '总结文本的token数量';

-- ==================== 3. 更新 conversation_messages 表 ====================
-- 添加总结相关字段（使用更安全的方式）
DO $$ 
BEGIN
  -- 添加 is_summarized 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation_messages' AND column_name = 'is_summarized'
  ) THEN
    ALTER TABLE conversation_messages ADD COLUMN is_summarized BOOLEAN DEFAULT FALSE;
    RAISE NOTICE '✓ 添加字段 is_summarized';
  ELSE
    RAISE NOTICE '- 字段 is_summarized 已存在';
  END IF;

  -- 添加 summary_id 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation_messages' AND column_name = 'summary_id'
  ) THEN
    ALTER TABLE conversation_messages ADD COLUMN summary_id UUID REFERENCES memory_summaries(id) ON DELETE SET NULL;
    RAISE NOTICE '✓ 添加字段 summary_id';
  ELSE
    RAISE NOTICE '- 字段 summary_id 已存在';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversation_messages_summarized ON conversation_messages(is_summarized);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_summary_id ON conversation_messages(summary_id);

COMMENT ON COLUMN conversation_messages.is_summarized IS '该消息是否已被总结';
COMMENT ON COLUMN conversation_messages.summary_id IS '关联的总结ID';

-- ==================== 4. 创建辅助函数 ====================

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

CREATE OR REPLACE FUNCTION update_memory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_memory_timestamp ON user_memories;
CREATE TRIGGER trigger_update_memory_timestamp
  BEFORE UPDATE ON user_memories
  FOR EACH ROW
  EXECUTE FUNCTION update_memory_timestamp();

-- ==================== 5. 验证脚本 ====================

DO $$
DECLARE
  table_count INTEGER;
  index_count INTEGER;
BEGIN
  -- 验证表
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_name IN ('conversation_messages', 'user_memories', 'memory_summaries');
  
  IF table_count = 3 THEN
    RAISE NOTICE '✓ 所有表创建成功 (3/3)';
  ELSE
    RAISE WARNING '⚠ 只创建了 %/3 个表', table_count;
  END IF;

  -- 验证索引
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE tablename IN ('user_memories', 'memory_summaries', 'conversation_messages')
    AND indexname LIKE 'idx_%';
  
  RAISE NOTICE '✓ 创建了 % 个索引', index_count;
  
  -- 验证字段
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation_messages' 
    AND column_name IN ('is_summarized', 'summary_id')
  ) THEN
    RAISE NOTICE '✓ conversation_messages 表字段添加成功';
  END IF;
END $$;

-- ==================== 完成 ====================
RAISE NOTICE '========================================';
RAISE NOTICE '✓ 跨阶段AI记忆系统数据库迁移完成！';
RAISE NOTICE '========================================';
