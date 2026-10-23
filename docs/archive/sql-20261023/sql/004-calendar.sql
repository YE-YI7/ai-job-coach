-- 面试日历表
CREATE TABLE IF NOT EXISTS interview_calendar (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  interview_date DATE NOT NULL,
  prep_plan JSONB, -- AI生成的备考计划
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_user ON interview_calendar(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_date ON interview_calendar(interview_date);
