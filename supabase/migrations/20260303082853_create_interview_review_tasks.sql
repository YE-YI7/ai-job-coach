-- 面试复盘训练任务表
CREATE TABLE IF NOT EXISTS interview_review_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id UUID REFERENCES interview_review_sessions(id) ON DELETE CASCADE,
  question_index INT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  task_type TEXT NOT NULL DEFAULT 'practice',
  source TEXT NOT NULL DEFAULT 'question',
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_tasks_user ON interview_review_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_review_tasks_session ON interview_review_tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_review_tasks_status ON interview_review_tasks(status);
CREATE INDEX IF NOT EXISTS idx_review_tasks_created ON interview_review_tasks(created_at DESC);

CREATE OR REPLACE FUNCTION update_review_task_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_review_task_updated ON interview_review_tasks;
CREATE TRIGGER trg_review_task_updated
  BEFORE UPDATE ON interview_review_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_review_task_updated_at();

ALTER TABLE interview_review_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interview_review_tasks_all" ON interview_review_tasks
  FOR ALL USING (true) WITH CHECK (true);
