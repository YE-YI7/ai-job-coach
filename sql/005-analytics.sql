-- 用户数据分析表
CREATE TABLE IF NOT EXISTS user_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  stage TEXT NOT NULL,
  metric_type TEXT NOT NULL, -- 'interview_score' | 'resume_score' | 'chat_count'
  metric_value FLOAT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_user ON user_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_stage_metric ON user_analytics(stage, metric_type);
