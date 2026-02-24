-- 修复 whiteboard_states 表结构
-- 请在 Supabase SQL Editor 中执行此脚本

-- 1. 如果 user_id 字段不存在，则添加
DO $$ 
DECLARE
  users_table_name TEXT;
BEGIN
  -- 检查是否存在 public.users 表，否则使用 auth.users
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    users_table_name := 'public.users';
  ELSE
    users_table_name := 'auth.users';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whiteboard_states' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE whiteboard_states 
    ADD COLUMN user_id UUID;
    
    -- 添加外键约束（动态引用 users 表）
    EXECUTE format('ALTER TABLE whiteboard_states 
      ADD CONSTRAINT whiteboard_states_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES %s(id) ON DELETE CASCADE', users_table_name);
  END IF;
END $$;

-- 2. 如果 user_id 字段存在但类型不匹配，则修改
DO $$ 
DECLARE
  users_table_name TEXT;
BEGIN
  -- 检查是否存在 public.users 表，否则使用 auth.users
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    users_table_name := 'public.users';
  ELSE
    users_table_name := 'auth.users';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whiteboard_states' 
    AND column_name = 'user_id' 
    AND data_type != 'uuid'
  ) THEN
    -- 先删除外键约束（如果存在）
    ALTER TABLE whiteboard_states DROP CONSTRAINT IF EXISTS whiteboard_states_user_id_fkey;
    -- 修改类型
    ALTER TABLE whiteboard_states ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
    -- 重新添加外键约束
    EXECUTE format('ALTER TABLE whiteboard_states 
      ADD CONSTRAINT whiteboard_states_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES %s(id) ON DELETE CASCADE', users_table_name);
  END IF;
END $$;

-- 3. 如果 data 字段不存在，则添加
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whiteboard_states' AND column_name = 'data'
  ) THEN
    ALTER TABLE whiteboard_states 
    ADD COLUMN data JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 4. 如果 data 字段存在但类型不匹配，则修改
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whiteboard_states' 
    AND column_name = 'data' 
    AND data_type != 'jsonb'
  ) THEN
    ALTER TABLE whiteboard_states ALTER COLUMN data TYPE JSONB USING data::jsonb;
    -- 设置默认值和 NOT NULL
    ALTER TABLE whiteboard_states 
    ALTER COLUMN data SET DEFAULT '{}'::jsonb,
    ALTER COLUMN data SET NOT NULL;
  END IF;
END $$;

-- 5. 如果 updated_at 字段不存在，则添加
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whiteboard_states' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE whiteboard_states 
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- 6. 如果 updated_at 字段存在但类型不匹配，则修改
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whiteboard_states' 
    AND column_name = 'updated_at' 
    AND data_type != 'timestamp with time zone'
  ) THEN
    ALTER TABLE whiteboard_states ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at::timestamptz;
    -- 设置默认值和 NOT NULL
    ALTER TABLE whiteboard_states 
    ALTER COLUMN updated_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET NOT NULL;
  END IF;
END $$;

-- 7. 确保 id 字段是主键（如果不存在）
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'whiteboard_states' 
    AND constraint_type = 'PRIMARY KEY'
  ) THEN
    -- 如果 id 字段不存在，先添加
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'whiteboard_states' AND column_name = 'id'
    ) THEN
      ALTER TABLE whiteboard_states 
      ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();
    ELSE
      -- 如果 id 存在但不是主键，添加主键约束
      ALTER TABLE whiteboard_states 
      ADD CONSTRAINT whiteboard_states_pkey PRIMARY KEY (id);
    END IF;
  END IF;
END $$;

-- 8. 创建唯一索引，确保每个用户只有一条记录
CREATE UNIQUE INDEX IF NOT EXISTS whiteboard_states_user_id_unique 
ON whiteboard_states (user_id);

-- 注意：old_user_id 字段保留，暂不删除

