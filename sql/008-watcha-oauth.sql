-- 观猹（Watcha）OAuth2 Token 存储表
-- 用于保存用户的 access_token 和 refresh_token，支持 token 刷新

CREATE TABLE IF NOT EXISTS watcha_tokens (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  watcha_user_id BIGINT NOT NULL,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 索引：按 watcha_user_id 查找
CREATE INDEX IF NOT EXISTS idx_watcha_tokens_watcha_user_id ON watcha_tokens(watcha_user_id);

-- users 表新增字段（如果不存在的话）
-- nickname: 用户昵称（观猹返回）
-- avatar_url: 头像 URL（观猹返回）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'nickname'
  ) THEN
    ALTER TABLE users ADD COLUMN nickname TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE users ADD COLUMN avatar_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'provider'
  ) THEN
    ALTER TABLE users ADD COLUMN provider TEXT DEFAULT 'email';
  END IF;
END $$;
