
-- 面试会话表
CREATE TABLE IF NOT EXISTS interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jd TEXT NOT NULL,
  round_type TEXT NOT NULL,
  question_count INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 面试题目表
CREATE TABLE IF NOT EXISTS interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  tips JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 面试答案表
CREATE TABLE IF NOT EXISTS interview_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES interview_questions(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  assessment JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引：加速按 session_id 查询
CREATE INDEX IF NOT EXISTS idx_interview_questions_session_id ON interview_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_interview_answers_session_id ON interview_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_interview_answers_question_id ON interview_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id ON interview_sessions(user_id);

-- RLS 策略：用户只能访问自己的面试数据
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_answers ENABLE ROW LEVEL SECURITY;

-- interview_sessions: 用户可以增删改查自己的会话
CREATE POLICY "Users can manage own interview sessions"
  ON interview_sessions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- interview_questions: 通过 session 关联用户
CREATE POLICY "Users can manage own interview questions"
  ON interview_questions FOR ALL
  USING (session_id IN (SELECT id FROM interview_sessions WHERE user_id = auth.uid()))
  WITH CHECK (session_id IN (SELECT id FROM interview_sessions WHERE user_id = auth.uid()));

-- interview_answers: 通过 session 关联用户
CREATE POLICY "Users can manage own interview answers"
  ON interview_answers FOR ALL
  USING (session_id IN (SELECT id FROM interview_sessions WHERE user_id = auth.uid()))
  WITH CHECK (session_id IN (SELECT id FROM interview_sessions WHERE user_id = auth.uid()));
