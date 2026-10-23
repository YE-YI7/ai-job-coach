
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================
-- 用户核心表
-- =====================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    nickname VARCHAR(50) NOT NULL DEFAULT 'Warrior',
    avatar_url TEXT,
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    exp_to_next_level INTEGER DEFAULT 100,
    is_first_login BOOLEAN DEFAULT TRUE,
    has_completed_onboarding BOOLEAN DEFAULT FALSE,
    has_signed_pact BOOLEAN DEFAULT FALSE,
    has_completed_excavation BOOLEAN DEFAULT FALSE,
    last_check_in_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    anti_vision TEXT,
    vision TEXT,
    core_enemy VARCHAR(50),
    identity_statement TEXT,
    weaknesses JSONB DEFAULT '[]'::jsonb,
    patterns JSONB DEFAULT '[]'::jsonb,
    max_depth_reached INTEGER DEFAULT 0,
    excavation_answers JSONB DEFAULT '{}'::jsonb,
    ai_analysis JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE TABLE user_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    total_boss_kills INTEGER DEFAULT 0,
    daily_boss_kills INTEGER DEFAULT 0,
    weekly_boss_kills INTEGER DEFAULT 0,
    monthly_boss_kills INTEGER DEFAULT 0,
    yearly_boss_kills INTEGER DEFAULT 0,
    ultimate_boss_damage BIGINT DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0,
    total_tasks_completed INTEGER DEFAULT 0,
    total_tasks_created INTEGER DEFAULT 0,
    total_tasks_abandoned INTEGER DEFAULT 0,
    total_time_spent INTEGER DEFAULT 0,
    days_since_join INTEGER DEFAULT 0,
    rebirth_count INTEGER DEFAULT 0,
    willpower INTEGER DEFAULT 0,
    confidence INTEGER DEFAULT 0,
    discipline INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE TABLE user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    particle_color VARCHAR(20) DEFAULT '#FF9D76',
    primary_color VARCHAR(20) DEFAULT '#FF9D76',
    sound_effects BOOLEAN DEFAULT TRUE,
    tts_enabled BOOLEAN DEFAULT TRUE,
    tts_voice VARCHAR(20) DEFAULT 'neutral',
    volume DECIMAL(3,2) DEFAULT 0.8,
    haptic_enabled BOOLEAN DEFAULT TRUE,
    haptic_intensity INTEGER DEFAULT 70,
    notification_enabled BOOLEAN DEFAULT TRUE,
    daily_reminder BOOLEAN DEFAULT TRUE,
    weekly_review BOOLEAN DEFAULT TRUE,
    encouragement BOOLEAN DEFAULT TRUE,
    privacy_mode BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- =====================================================
-- 契约与引导
-- =====================================================

CREATE TABLE pacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    signed_at TIMESTAMPTZ NOT NULL,
    content TEXT NOT NULL,
    recording_url TEXT,
    fingerprint_data TEXT,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Boss系统
-- =====================================================

CREATE TABLE bosses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('daily', 'weekly', 'monthly', 'yearly', 'ultimate')),
    name VARCHAR(100) NOT NULL,
    max_hp INTEGER NOT NULL,
    current_hp INTEGER NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'defeated', 'failed')),
    defeated_at TIMESTAMPTZ,
    phase INTEGER DEFAULT 1,
    damage_history JSONB DEFAULT '[]'::jsonb,
    rewards_experience INTEGER DEFAULT 0,
    rewards_willpower INTEGER DEFAULT 0,
    rewards_confidence INTEGER DEFAULT 0,
    rewards_achievements JSONB DEFAULT '[]'::jsonb,
    special_events JSONB DEFAULT '[]'::jsonb,
    ai_generated_image TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    boss_id UUID REFERENCES bosses(id) ON DELETE SET NULL,
    title VARCHAR(100) NOT NULL,
    icon VARCHAR(10) DEFAULT '⚔️',
    description TEXT,
    damage INTEGER NOT NULL,
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    estimated_duration INTEGER DEFAULT 30,
    actual_duration INTEGER,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed', 'failed')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    rewards_experience INTEGER DEFAULT 10,
    rewards_willpower INTEGER DEFAULT 5,
    rewards_confidence INTEGER DEFAULT 5,
    generated_by VARCHAR(10) DEFAULT 'ai' CHECK (generated_by IN ('ai', 'user')),
    generation_context JSONB,
    scheduled_for DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 任务完成与AI反馈
-- =====================================================

CREATE TABLE task_completions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    boss_id UUID REFERENCES bosses(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    completion_method VARCHAR(20) DEFAULT 'manual' CHECK (completion_method IN ('manual', 'timer', 'auto')),
    quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 5),
    user_feedback TEXT,
    user_feeling VARCHAR(20),
    ai_feedback TEXT,
    skill_unlocked UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 技能系统
-- =====================================================

CREATE TABLE boss_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    icon VARCHAR(10) DEFAULT '⭐',
    unlock_condition JSONB NOT NULL,
    prerequisite_skills JSONB DEFAULT '[]'::jsonb,
    effect_description TEXT,
    usage_scenario TEXT,
    difficulty_level INTEGER DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES boss_skills(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    proficiency INTEGER DEFAULT 0 CHECK (proficiency BETWEEN 0 AND 100),
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    effectiveness_rating DECIMAL(3,2) DEFAULT 0,
    user_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, skill_id)
);

-- =====================================================
-- AI系统
-- =====================================================

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'ai')),
    content TEXT NOT NULL,
    emotion_analysis JSONB,
    context JSONB,
    response_time_ms INTEGER,
    tokens_used INTEGER,
    session_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    memory_type VARCHAR(30) NOT NULL,
    key_info TEXT NOT NULL,
    extracted_from UUID REFERENCES conversations(id) ON DELETE SET NULL,
    confidence_score DECIMAL(3,2) DEFAULT 0.5,
    behavior_pattern JSONB,
    adjustment_strategy TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 日记与复盘
-- =====================================================

CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    title VARCHAR(200),
    content TEXT,
    related_boss_id UUID REFERENCES bosses(id) ON DELETE SET NULL,
    related_task_ids JSONB DEFAULT '[]'::jsonb,
    ai_insights JSONB DEFAULT '[]'::jsonb,
    emotional_tone VARCHAR(20),
    tags JSONB DEFAULT '[]'::jsonb,
    attachments JSONB DEFAULT '[]'::jsonb,
    is_auto_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE weekly_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    completion_rate DECIMAL(5,2) DEFAULT 0,
    bosses_defeated INTEGER DEFAULT 0,
    tasks_completed INTEGER DEFAULT 0,
    user_answers JSONB DEFAULT '{}'::jsonb,
    ai_analysis JSONB DEFAULT '{}'::jsonb,
    insights JSONB DEFAULT '[]'::jsonb,
    patterns_identified JSONB DEFAULT '[]'::jsonb,
    next_week_focus TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, week_start)
);

-- =====================================================
-- 成就系统
-- =====================================================

CREATE TABLE achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(10) DEFAULT '🏆',
    category VARCHAR(50) NOT NULL,
    condition JSONB NOT NULL,
    rewards_experience INTEGER DEFAULT 0,
    rewards_willpower INTEGER DEFAULT 0,
    is_hidden BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMPTZ,
    progress DECIMAL(5,2) DEFAULT 0,
    notified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

-- =====================================================
-- 付费与订阅
-- =====================================================

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan VARCHAR(30) DEFAULT 'free' CHECK (plan IN ('free', 'monthly', 'yearly', 'lifetime')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'pending')),
    payment_provider VARCHAR(30),
    provider_subscription_id VARCHAR(255),
    price_paid DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'USD',
    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    auto_renew BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payment_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    payment_method VARCHAR(30),
    provider_transaction_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('success', 'failed', 'pending', 'refunded')),
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 每日签到
-- =====================================================

CREATE TABLE daily_check_ins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    check_in_date DATE NOT NULL DEFAULT CURRENT_DATE,
    challenge_type VARCHAR(30) NOT NULL,
    challenge_completed BOOLEAN DEFAULT FALSE,
    challenge_data JSONB,
    rewards_experience INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, check_in_date)
);
