-- 邮箱验证码表
CREATE TABLE IF NOT EXISTS email_verification_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引：按邮箱+未使用+未过期查询
CREATE INDEX IF NOT EXISTS idx_email_codes_lookup 
  ON email_verification_codes(email, used, expires_at);
