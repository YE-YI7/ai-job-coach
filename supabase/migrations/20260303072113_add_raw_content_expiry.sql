
-- 添加原始文本过期时间列
ALTER TABLE interview_review_sessions 
ADD COLUMN IF NOT EXISTS raw_content_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days');

-- 为已有数据设置过期时间
UPDATE interview_review_sessions 
SET raw_content_expires_at = created_at + INTERVAL '30 days'
WHERE raw_content_expires_at IS NULL;

-- 创建清理过期原始文本的函数
CREATE OR REPLACE FUNCTION cleanup_expired_raw_content()
RETURNS INTEGER AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE interview_review_sessions
  SET raw_content = NULL
  WHERE raw_content IS NOT NULL
    AND raw_content_expires_at IS NOT NULL
    AND raw_content_expires_at < NOW();
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 添加索引用于高效清理查询
CREATE INDEX IF NOT EXISTS idx_review_sessions_raw_expires 
ON interview_review_sessions (raw_content_expires_at) 
WHERE raw_content IS NOT NULL;
