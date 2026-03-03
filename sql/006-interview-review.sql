-- 面试复盘会话表
CREATE TABLE IF NOT EXISTS interview_review_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  round TEXT NOT NULL DEFAULT '',
  interview_time DATE,
  tags TEXT[] DEFAULT '{}',
  raw_content TEXT NOT NULL DEFAULT '',
  resume_snapshot TEXT,
  -- 分析结果（JSONB 存储完整结构化数据）
  parsed_questions JSONB DEFAULT '[]',
  analysis_results JSONB DEFAULT '[]',
  summary JSONB,
  roles_used JSONB DEFAULT '[]',
  -- 状态
  status TEXT NOT NULL DEFAULT 'draft', -- draft | parsed | analyzed | error
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_sessions_user ON interview_review_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_review_sessions_company ON interview_review_sessions(company);
CREATE INDEX IF NOT EXISTS idx_review_sessions_round ON interview_review_sessions(round);
CREATE INDEX IF NOT EXISTS idx_review_sessions_time ON interview_review_sessions(interview_time DESC);
CREATE INDEX IF NOT EXISTS idx_review_sessions_status ON interview_review_sessions(status);
CREATE INDEX IF NOT EXISTS idx_review_sessions_created ON interview_review_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_sessions_tags ON interview_review_sessions USING GIN(tags);

-- 追问记录表（按题目维度存储）
CREATE TABLE IF NOT EXISTS interview_review_followups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES interview_review_sessions(id) ON DELETE CASCADE,
  question_index INT NOT NULL,
  followups JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_followups_session ON interview_review_followups(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_followups_unique ON interview_review_followups(session_id, question_index);

-- updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION update_review_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_review_session_updated ON interview_review_sessions;
CREATE TRIGGER trg_review_session_updated
  BEFORE UPDATE ON interview_review_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_review_session_updated_at();
