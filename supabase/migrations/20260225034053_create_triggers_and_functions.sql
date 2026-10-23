
-- =====================================================
-- 6.1 自动更新时间戳
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_stats_updated_at BEFORE UPDATE ON user_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bosses_updated_at BEFORE UPDATE ON bosses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_memory_updated_at BEFORE UPDATE ON ai_memory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_journal_entries_updated_at BEFORE UPDATE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_skills_updated_at BEFORE UPDATE ON user_skills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_achievements_updated_at BEFORE UPDATE ON user_achievements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 6.2 新用户注册触发器 (SECURITY DEFINER to bypass RLS)
-- =====================================================

CREATE OR REPLACE FUNCTION create_user_related_data()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_profiles (user_id) VALUES (NEW.id);
    INSERT INTO user_stats (user_id) VALUES (NEW.id);
    INSERT INTO user_settings (user_id) VALUES (NEW.id);
    INSERT INTO subscriptions (user_id, plan, status, started_at)
    VALUES (NEW.id, 'free', 'active', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

CREATE TRIGGER on_user_created
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION create_user_related_data();

-- =====================================================
-- 6.3 任务完成触发器
-- =====================================================

CREATE OR REPLACE FUNCTION on_task_completed()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        UPDATE user_stats
        SET total_tasks_completed = total_tasks_completed + 1,
            total_time_spent = total_time_spent + COALESCE(NEW.actual_duration, NEW.estimated_duration)
        WHERE user_id = NEW.user_id;

        IF NEW.boss_id IS NOT NULL THEN
            UPDATE bosses
            SET current_hp = GREATEST(0, current_hp - NEW.damage),
                damage_history = damage_history || jsonb_build_object(
                    'timestamp', EXTRACT(EPOCH FROM NOW())::bigint * 1000,
                    'damage', NEW.damage,
                    'taskId', NEW.id
                )
            WHERE id = NEW.boss_id;
        END IF;

        INSERT INTO task_completions (user_id, task_id, boss_id, completion_method)
        VALUES (NEW.user_id, NEW.id, NEW.boss_id, 'manual');
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

CREATE TRIGGER on_task_status_change
    AFTER UPDATE OF status ON tasks
    FOR EACH ROW EXECUTE FUNCTION on_task_completed();

-- =====================================================
-- 6.4 Boss击败触发器
-- =====================================================

CREATE OR REPLACE FUNCTION check_boss_defeated()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_hp = 0 AND OLD.current_hp > 0 AND NEW.status = 'active' THEN
        NEW.status := 'defeated';
        NEW.defeated_at := NOW();

        UPDATE user_stats
        SET total_boss_kills = total_boss_kills + 1,
            daily_boss_kills = CASE WHEN NEW.type = 'daily' THEN daily_boss_kills + 1 ELSE daily_boss_kills END,
            weekly_boss_kills = CASE WHEN NEW.type = 'weekly' THEN weekly_boss_kills + 1 ELSE weekly_boss_kills END,
            monthly_boss_kills = CASE WHEN NEW.type = 'monthly' THEN monthly_boss_kills + 1 ELSE monthly_boss_kills END,
            yearly_boss_kills = CASE WHEN NEW.type = 'yearly' THEN yearly_boss_kills + 1 ELSE yearly_boss_kills END
        WHERE user_id = NEW.user_id;

        UPDATE users
        SET experience = experience + NEW.rewards_experience
        WHERE id = NEW.user_id;

        UPDATE user_stats
        SET willpower = willpower + NEW.rewards_willpower,
            confidence = confidence + NEW.rewards_confidence
        WHERE user_id = NEW.user_id;

        INSERT INTO journal_entries (user_id, type, title, content, related_boss_id, is_auto_generated)
        VALUES (
            NEW.user_id,
            'boss_defeat',
            '击败了 ' || NEW.name,
            '恭喜！你成功击败了Boss「' || NEW.name || '」，获得了 ' || NEW.rewards_experience || ' 经验值！',
            NEW.id,
            TRUE
        );
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

CREATE TRIGGER on_boss_hp_change
    BEFORE UPDATE OF current_hp ON bosses
    FOR EACH ROW EXECUTE FUNCTION check_boss_defeated();

-- =====================================================
-- 6.5 等级提升触发器
-- =====================================================

CREATE OR REPLACE FUNCTION check_level_up()
RETURNS TRIGGER AS $$
DECLARE
    exp_needed INTEGER;
BEGIN
    exp_needed := FLOOR(100 * POWER(1.5, NEW.level - 1));

    WHILE NEW.experience >= exp_needed LOOP
        NEW.experience := NEW.experience - exp_needed;
        NEW.level := NEW.level + 1;
        exp_needed := FLOOR(100 * POWER(1.5, NEW.level - 1));

        INSERT INTO journal_entries (user_id, type, title, content, is_auto_generated)
        VALUES (
            NEW.id,
            'level_up',
            '等级提升至 Lv.' || NEW.level,
            '恭喜你达到了新的等级！继续努力，击败更多Boss！',
            TRUE
        );
    END LOOP;

    NEW.exp_to_next_level := exp_needed;
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

CREATE TRIGGER on_experience_change
    BEFORE UPDATE OF experience ON users
    FOR EACH ROW EXECUTE FUNCTION check_level_up();

-- =====================================================
-- 6.6 连续打卡触发器
-- =====================================================

CREATE OR REPLACE FUNCTION update_streak_on_checkin()
RETURNS TRIGGER AS $$
DECLARE
    last_checkin DATE;
BEGIN
    SELECT check_in_date INTO last_checkin
    FROM daily_check_ins
    WHERE user_id = NEW.user_id AND check_in_date < NEW.check_in_date
    ORDER BY check_in_date DESC
    LIMIT 1;

    IF last_checkin IS NULL OR last_checkin = NEW.check_in_date - INTERVAL '1 day' THEN
        UPDATE user_stats
        SET current_streak = current_streak + 1,
            longest_streak = GREATEST(longest_streak, current_streak + 1)
        WHERE user_id = NEW.user_id;
    ELSE
        UPDATE user_stats
        SET current_streak = 1
        WHERE user_id = NEW.user_id;
    END IF;

    UPDATE users
    SET last_check_in_date = NEW.check_in_date
    WHERE id = NEW.user_id;

    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

CREATE TRIGGER on_daily_checkin
    AFTER INSERT ON daily_check_ins
    FOR EACH ROW EXECUTE FUNCTION update_streak_on_checkin();

-- =====================================================
-- 新用户通过 auth 注册时自动创建 public.users 记录
-- =====================================================

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, nickname)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            split_part(COALESCE(NEW.email, 'Warrior@'), '@', 1),
            'Warrior'
        )
    );
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
