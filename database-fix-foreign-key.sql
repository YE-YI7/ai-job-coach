-- 修复 resume_changes_log 表的外键约束
-- 问题：resume_id 外键指向了错误的表 (user_resumes)
-- 解决：应该指向 resumes 表

-- 步骤 1: 删除错误的外键约束
ALTER TABLE resume_changes_log 
DROP CONSTRAINT IF EXISTS resume_changes_log_resume_id_fkey;

-- 步骤 2: 添加正确的外键约束（指向 resumes 表）
ALTER TABLE resume_changes_log 
ADD CONSTRAINT resume_changes_log_resume_id_fkey 
FOREIGN KEY (resume_id) 
REFERENCES resumes(id) 
ON DELETE CASCADE;

-- 验证外键约束
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name = 'resume_changes_log';
