-- 用户额度表
CREATE TABLE IF NOT EXISTS user_quotas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  free_chat_daily INT DEFAULT 3,
  free_resume_daily INT DEFAULT 1,
  paid_chat_remaining INT DEFAULT 0,
  paid_resume_remaining INT DEFAULT 0,
  paid_interview_remaining INT DEFAULT 0,
  last_free_reset DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_quotas_user_id ON user_quotas(user_id);

-- 兑换码表
CREATE TABLE IF NOT EXISTS redemption_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  product_type TEXT NOT NULL, -- 'interview_pack' | 'vip_monthly' | 'resume_pack'
  quota_config JSONB NOT NULL, -- {"chat": 0, "resume": 3, "interview": 10}
  used BOOLEAN DEFAULT FALSE,
  used_by UUID,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_redemption_codes_code ON redemption_codes(code);
