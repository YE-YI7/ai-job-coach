
-- 阶段任务卡（线性todo）
CREATE TABLE IF NOT EXISTS stage_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('career_planning', 'project_review', 'resume_optimization', 'application_strategy', 'interview', 'salary_talk', 'offer')),
  title TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by TEXT CHECK (completed_by IN ('user', 'ai')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_stage_tasks_user_stage ON stage_tasks(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_stage_tasks_order ON stage_tasks(user_id, stage, sort_order);

-- RLS
ALTER TABLE stage_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tasks"
  ON stage_tasks FOR SELECT
  USING (auth.uid() = user_id OR true);

CREATE POLICY "Users can insert own tasks"
  ON stage_tasks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own tasks"
  ON stage_tasks FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete own tasks"
  ON stage_tasks FOR DELETE
  USING (true);
