-- 数据库初始化脚本
-- 用于创建 users 和 sessions 表
-- 如果表已存在，则不会报错（使用 IF NOT EXISTS）

-- 创建 users 表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建 sessions 表
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT,
  ip TEXT,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- 确保 conversation_messages 表有 user_id 字段（如果表存在）
-- 注意：如果表不存在，这个语句会失败，需要先创建表
-- 如果表已存在但没有 user_id 字段，需要手动添加：
-- ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- 确保 whiteboard_states 表有 user_id 字段（如果表存在）
-- 注意：如果表不存在，这个语句会失败，需要先创建表
-- 如果表已存在但没有 user_id 字段，需要手动添加：
-- ALTER TABLE whiteboard_states ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);









