
-- =====================================================
-- 索引
-- =====================================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_stats_user_id ON user_stats(user_id);
CREATE INDEX idx_user_stats_current_streak ON user_stats(current_streak DESC);

CREATE INDEX idx_bosses_user_id ON bosses(user_id);
CREATE INDEX idx_bosses_status ON bosses(status);
CREATE INDEX idx_bosses_type ON bosses(type);
CREATE INDEX idx_bosses_user_status ON bosses(user_id, status);
CREATE INDEX idx_bosses_start_date ON bosses(start_date);

CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_boss_id ON tasks(boss_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_scheduled_for ON tasks(scheduled_for);
CREATE INDEX idx_tasks_user_date ON tasks(user_id, scheduled_for);

CREATE INDEX idx_task_completions_user_id ON task_completions(user_id);
CREATE INDEX idx_task_completions_task_id ON task_completions(task_id);
CREATE INDEX idx_task_completions_completed_at ON task_completions(completed_at);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_session_id ON conversations(session_id);
CREATE INDEX idx_conversations_type ON conversations(type);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);

CREATE INDEX idx_ai_memory_user_id ON ai_memory(user_id);
CREATE INDEX idx_ai_memory_type ON ai_memory(memory_type);
CREATE INDEX idx_ai_memory_active ON ai_memory(user_id, is_active) WHERE is_active = TRUE;

CREATE INDEX idx_journal_entries_user_id ON journal_entries(user_id);
CREATE INDEX idx_journal_entries_type ON journal_entries(type);
CREATE INDEX idx_journal_entries_created_at ON journal_entries(created_at);

CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_unlocked ON user_achievements(user_id, unlocked_at) WHERE unlocked_at IS NOT NULL;

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_expires ON subscriptions(expires_at);

CREATE INDEX idx_daily_check_ins_user_date ON daily_check_ins(user_id, check_in_date);

-- =====================================================
-- 约束
-- =====================================================

ALTER TABLE bosses ADD CONSTRAINT bosses_hp_check CHECK (current_hp >= 0);
ALTER TABLE tasks ADD CONSTRAINT tasks_damage_positive CHECK (damage > 0);
ALTER TABLE user_stats ADD CONSTRAINT stats_rate_range CHECK (completion_rate >= 0 AND completion_rate <= 100);
ALTER TABLE users ADD CONSTRAINT users_exp_non_negative CHECK (experience >= 0);
ALTER TABLE users ADD CONSTRAINT users_level_positive CHECK (level >= 1);
