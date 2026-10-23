
-- 插入预设成就
INSERT INTO achievements (name, description, icon, category, condition, rewards_experience, rewards_willpower, display_order) VALUES
('首次胜利', '击败第一个日Boss', '💀', 'combat', '{"type": "boss_kills", "count": 1}', 50, 10, 1),
('周度战士', '击败第一个周Boss', '⚔️', 'combat', '{"type": "weekly_boss_kills", "count": 1}', 100, 20, 2),
('月度征服者', '击败第一个月Boss', '🛡️', 'combat', '{"type": "monthly_boss_kills", "count": 1}', 200, 40, 3),
('年度霸主', '击败年Boss', '👑', 'combat', '{"type": "yearly_boss_kills", "count": 1}', 500, 100, 4),
('Boss猎人', '累计击败10个Boss', '🎯', 'combat', '{"type": "total_boss_kills", "count": 10}', 100, 20, 5),
('Boss屠夫', '累计击败50个Boss', '💪', 'combat', '{"type": "total_boss_kills", "count": 50}', 300, 50, 6),
('Boss终结者', '累计击败100个Boss', '🔥', 'combat', '{"type": "total_boss_kills", "count": 100}', 500, 100, 7),
('初露锋芒', '连续3天完成每日任务', '🌱', 'consistency', '{"type": "streak", "count": 3}', 30, 10, 10),
('坚持一周', '连续7天完成每日任务', '🌿', 'consistency', '{"type": "streak", "count": 7}', 70, 20, 11),
('两周战士', '连续14天完成每日任务', '🌳', 'consistency', '{"type": "streak", "count": 14}', 140, 40, 12),
('坚持之王', '连续30天完成每日任务', '👑', 'consistency', '{"type": "streak", "count": 30}', 300, 80, 13),
('钢铁意志', '连续60天完成每日任务', '💎', 'consistency', '{"type": "streak", "count": 60}', 600, 150, 14),
('传奇坚持', '连续100天完成每日任务', '🏆', 'consistency', '{"type": "streak", "count": 100}', 1000, 250, 15),
('觉醒者', '完成首次AI问诊', '👁️', 'milestone', '{"type": "excavation_completed"}', 50, 15, 20),
('契约签订者', '签署重生契约', '📜', 'milestone', '{"type": "pact_signed"}', 30, 10, 21),
('新手毕业', '达到5级', '🎓', 'milestone', '{"type": "level", "count": 5}', 50, 15, 22),
('进阶玩家', '达到10级', '⭐', 'milestone', '{"type": "level", "count": 10}', 100, 30, 23),
('资深战士', '达到20级', '🌟', 'milestone', '{"type": "level", "count": 20}', 200, 60, 24),
('大师级', '达到50级', '💫', 'milestone', '{"type": "level", "count": 50}', 500, 150, 25),
('完美一周', '一周内所有任务100%完成', '✨', 'perfect', '{"type": "perfect_week"}', 100, 30, 30),
('完美一月', '一个月内所有任务100%完成', '🌙', 'perfect', '{"type": "perfect_month"}', 300, 80, 31),
('零失误大师', '连续完成50个任务无失败', '🎯', 'perfect', '{"type": "consecutive_tasks", "count": 50}', 200, 50, 32);

-- 插入预设Boss技能
INSERT INTO boss_skills (name, description, category, icon, unlock_condition, effect_description, usage_scenario, difficulty_level) VALUES
('番茄工作法', '使用25分钟专注+5分钟休息的工作循环', 'time_management', '🍅', '{"type": "tasks_completed", "count": 5}', '提高专注力，减少拖延', '需要长时间专注的工作任务', 1),
('时间盒子', '为任务设定严格的时间限制', 'time_management', '📦', '{"type": "tasks_completed", "count": 10}', '避免完美主义导致的过度耗时', '容易拖延的任务', 2),
('吃掉青蛙', '先完成最困难的任务', 'time_management', '🐸', '{"type": "boss_kills", "count": 3}', '克服拖延，建立成就感', '每日开始时', 2),
('两分钟法则', '两分钟内能完成的立即做', 'time_management', '⚡', '{"type": "tasks_completed", "count": 20}', '清除小任务，保持momentum', '面对大量小任务时', 1),
('情绪觉察', '在行动前识别自己的情绪状态', 'emotion', '🎭', '{"type": "check_ins", "count": 7}', '提高情绪智力，减少冲动行为', '感到焦虑或抵触时', 2),
('深呼吸锚定', '使用4-7-8呼吸法平静情绪', 'emotion', '🌬️', '{"type": "check_ins", "count": 3}', '快速降低焦虑水平', '任务开始前感到紧张时', 1),
('自我同情', '对自己的失败给予理解而非批判', 'emotion', '💗', '{"type": "tasks_failed", "count": 3}', '从失败中恢复，保持前进动力', '任务失败或放弃后', 3),
('情绪重构', '将负面情绪转化为行动动力', 'emotion', '🔄', '{"type": "boss_kills", "count": 5}', '把焦虑转化为准备，把恐惧转化为谨慎', '面对困难任务时', 3),
('习惯堆叠', '将新习惯附着在已有习惯上', 'habit', '📚', '{"type": "streak", "count": 7}', '降低新习惯的启动成本', '建立新的每日routine时', 2),
('环境设计', '改变环境使好习惯更容易', 'habit', '🏠', '{"type": "boss_kills", "count": 7}', '减少意志力消耗', '总是在特定环境中失败时', 2),
('身份认同', '从"做什么"转变为"是谁"', 'habit', '🪞', '{"type": "level", "count": 10}', '深层次的行为改变', '需要根本性改变时', 4),
('最小可行习惯', '将习惯缩减到不能拒绝的程度', 'habit', '🔬', '{"type": "tasks_completed", "count": 30}', '突破启动障碍', '面对重大改变时', 1),
('单任务模式', '一次只做一件事', 'focus', '🎯', '{"type": "tasks_completed", "count": 15}', '提高任务质量和效率', '多任务导致效率低下时', 1),
('注意力恢复', '通过自然环境恢复注意力', 'focus', '🌲', '{"type": "consecutive_tasks", "count": 5}', '减少注意力疲劳', '长时间工作后', 2),
('深度工作', '进入无干扰的深度专注状态', 'focus', '🧠', '{"type": "total_time_spent", "hours": 50}', '产出高质量工作', '需要创造性或复杂思考时', 4),
('心流触发', '创造进入心流状态的条件', 'focus', '🌊', '{"type": "boss_kills", "count": 15}', '体验沉浸式工作的乐趣', '重要且有挑战性的任务', 5);
