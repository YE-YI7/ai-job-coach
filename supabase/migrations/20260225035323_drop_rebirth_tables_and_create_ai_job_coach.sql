
-- ============================================================
-- Step 1: Drop ALL REBIRTH PROTOCOL tables (wrong project)
-- ============================================================
DROP TABLE IF EXISTS daily_check_ins CASCADE;
DROP TABLE IF EXISTS payment_history CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS user_achievements CASCADE;
DROP TABLE IF EXISTS achievements CASCADE;
DROP TABLE IF EXISTS weekly_reviews CASCADE;
DROP TABLE IF EXISTS journal_entries CASCADE;
DROP TABLE IF EXISTS ai_memory CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS user_skills CASCADE;
DROP TABLE IF EXISTS boss_skills CASCADE;
DROP TABLE IF EXISTS task_completions CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS bosses CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS user_stats CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS pacts CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop old functions/triggers if any
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS update_memory_timestamp() CASCADE;
DROP FUNCTION IF EXISTS get_active_memory_count(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_unsummarized_message_count(UUID, TEXT) CASCADE;

-- ============================================================
-- Step 2: Create AI Job Coach tables
-- ============================================================

-- 1. users 表 (核心用户表)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  provider TEXT,
  invite_code TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW()
);

-- 2. sessions 表
CREATE TABLE sessions (
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

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_is_active ON sessions(is_active);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- 3. conversation_messages 表
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  stage TEXT,
  is_summarized BOOLEAN DEFAULT FALSE,
  summary_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversation_messages_session ON conversation_messages(session_id);
CREATE INDEX idx_conversation_messages_user ON conversation_messages(user_id);
CREATE INDEX idx_conversation_messages_stage ON conversation_messages(stage);
CREATE INDEX idx_conversation_messages_summarized ON conversation_messages(is_summarized);

-- 4. whiteboard_states 表
CREATE TABLE whiteboard_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  whiteboard JSONB NOT NULL DEFAULT '{}'::jsonb,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX whiteboard_states_user_id_unique ON whiteboard_states(user_id);

-- 5. user_progress 表
CREATE TABLE user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  current_stage TEXT NOT NULL DEFAULT 'career_planning',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_progress_user_id ON user_progress(user_id);

-- 6. resumes 表
CREATE TABLE resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT,
  filename TEXT,
  raw_text TEXT,
  parsed JSONB,
  parsed_data JSONB,
  storage_url TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resumes_user ON resumes(user_id);

-- 7. user_resumes 表
CREATE TABLE user_resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT,
  original_file_url TEXT,
  parsed_text TEXT,
  parsed_meta JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_resumes_user ON user_resumes(user_id);

-- 8. resume_changes_log 表
CREATE TABLE resume_changes_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT,
  action_type TEXT NOT NULL,
  action_content JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resume_changes_resume ON resume_changes_log(resume_id);
CREATE INDEX idx_resume_changes_user ON resume_changes_log(user_id);

-- 9. user_memories 表 (跨阶段记忆)
CREATE TABLE user_memories (
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

CREATE INDEX idx_user_memories_user_stage ON user_memories(user_id, stage);
CREATE INDEX idx_user_memories_user_active ON user_memories(user_id, is_active);
CREATE INDEX idx_user_memories_importance ON user_memories(importance DESC);
CREATE INDEX idx_user_memories_type ON user_memories(memory_type);

-- 10. memory_summaries 表
CREATE TABLE memory_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('career', 'project', 'resume', 'delivery', 'interview', 'salary', 'offer')),
  summary_content TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  token_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memory_summaries_user_stage ON memory_summaries(user_id, stage);
CREATE INDEX idx_memory_summaries_created ON memory_summaries(created_at DESC);

-- 添加 conversation_messages 的 summary_id 外键
ALTER TABLE conversation_messages
  ADD CONSTRAINT fk_conversation_messages_summary
  FOREIGN KEY (summary_id) REFERENCES memory_summaries(id) ON DELETE SET NULL;

CREATE INDEX idx_conversation_messages_summary_id ON conversation_messages(summary_id);

-- 11. user_quotas 表
CREATE TABLE user_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX idx_user_quotas_user_id ON user_quotas(user_id);

-- 12. email_verification_codes 表
CREATE TABLE email_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_codes_lookup ON email_verification_codes(email, used, expires_at);

-- 13. invites 表 (邀请码)
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  uses_count INT DEFAULT 0,
  max_uses INT DEFAULT 1,
  redeemed_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invites_code ON invites(code);

-- 14. referrals 表
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL,
  referee_id UUID NOT NULL,
  referral_code TEXT NOT NULL,
  reward_granted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_referrals_code ON referrals(referral_code);

-- 15. stage_tasks 表 (AI驱动的待办任务)
CREATE TABLE stage_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stage_tasks_user_stage ON stage_tasks(user_id, stage);
CREATE INDEX idx_stage_tasks_completed ON stage_tasks(is_completed);

-- 16. redemption_codes 表 (兑换码)
CREATE TABLE redemption_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  product_type TEXT NOT NULL,
  quota_config JSONB NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_by UUID,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_redemption_codes_code ON redemption_codes(code);

-- 17. interview_calendar 表
CREATE TABLE interview_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  interview_date DATE NOT NULL,
  prep_plan JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calendar_user ON interview_calendar(user_id);
CREATE INDEX idx_calendar_date ON interview_calendar(interview_date);

-- 18. user_analytics 表
CREATE TABLE user_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  stage TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  metric_value FLOAT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_user ON user_analytics(user_id);
CREATE INDEX idx_analytics_stage_metric ON user_analytics(stage, metric_type);

-- ============================================================
-- Step 3: Create helper functions and triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_whiteboard_updated_at
  BEFORE UPDATE ON whiteboard_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_progress_updated_at
  BEFORE UPDATE ON user_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_memory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_memory_timestamp
  BEFORE UPDATE ON user_memories
  FOR EACH ROW EXECUTE FUNCTION update_memory_timestamp();

CREATE OR REPLACE FUNCTION get_active_memory_count(p_user_id UUID, p_stage TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*) FROM user_memories
    WHERE user_id = p_user_id AND stage = p_stage AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_unsummarized_message_count(p_user_id UUID, p_stage TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*) FROM conversation_messages
    WHERE user_id = p_user_id AND stage = p_stage AND is_summarized = FALSE
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Step 4: Disable RLS for all tables (use service role key)
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whiteboard_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_changes_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemption_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_analytics ENABLE ROW LEVEL SECURITY;

-- RLS policies: allow anon/authenticated full access (service role bypasses RLS)
CREATE POLICY "Allow all for anon" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON conversation_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON whiteboard_states FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON user_progress FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON resumes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON user_resumes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON resume_changes_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON user_memories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON memory_summaries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON user_quotas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON email_verification_codes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON invites FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON referrals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON stage_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON redemption_codes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON interview_calendar FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON user_analytics FOR ALL USING (true) WITH CHECK (true);
