-- AI Job Coach MySQL 数据库 Schema
-- 使用邀请码作为用户唯一ID

-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS ai_job_coach CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE ai_job_coach;

-- 1. 用户表（使用邀请码作为主键）
CREATE TABLE IF NOT EXISTS users (
  invite_code VARCHAR(20) PRIMARY KEY COMMENT '邀请码，作为用户唯一ID',
  phone VARCHAR(20) UNIQUE COMMENT '手机号（可选）',
  email VARCHAR(100) UNIQUE COMMENT '邮箱（可选）',
  nickname VARCHAR(50) COMMENT '昵称',
  provider VARCHAR(20) DEFAULT 'anonymous' COMMENT '注册方式：phone/email/oauth/anonymous',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后活跃时间',
  INDEX idx_phone (phone),
  INDEX idx_email (email),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 2. 会话表（支持多端、多会话）
CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(36) PRIMARY KEY COMMENT '会话ID（UUID）',
  user_id VARCHAR(20) NOT NULL COMMENT '用户邀请码',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  FOREIGN KEY (user_id) REFERENCES users(invite_code) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会话表';

-- 3. 对话消息表
CREATE TABLE IF NOT EXISTS conversation_messages (
  id VARCHAR(36) PRIMARY KEY COMMENT '消息ID（UUID）',
  session_id VARCHAR(36) NOT NULL COMMENT '会话ID',
  role ENUM('user', 'assistant', 'system') NOT NULL COMMENT '角色',
  content TEXT NOT NULL COMMENT '消息内容',
  stage VARCHAR(50) COMMENT '当前阶段，用于区分不同阶段的对话',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  INDEX idx_session_id (session_id),
  INDEX idx_created_at (created_at),
  INDEX idx_stage (stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='对话消息表';

-- 4. 白板状态表
CREATE TABLE IF NOT EXISTS whiteboard_states (
  id VARCHAR(36) PRIMARY KEY COMMENT '白板ID（UUID）',
  session_id VARCHAR(36) NOT NULL UNIQUE COMMENT '会话ID（唯一）',
  whiteboard JSON COMMENT '白板状态数据',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  INDEX idx_session_id (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='白板状态表';

-- 5. 用户进度表
CREATE TABLE IF NOT EXISTS user_progress (
  id VARCHAR(36) PRIMARY KEY COMMENT '进度ID（UUID）',
  user_id VARCHAR(20) NOT NULL UNIQUE COMMENT '用户邀请码（唯一）',
  current_stage VARCHAR(50) DEFAULT 'career_planning' COMMENT '当前阶段',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  FOREIGN KEY (user_id) REFERENCES users(invite_code) ON DELETE CASCADE,
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户进度表';

-- 6. 简历表
CREATE TABLE IF NOT EXISTS resumes (
  id VARCHAR(36) PRIMARY KEY COMMENT '简历ID（UUID）',
  user_id VARCHAR(20) NOT NULL COMMENT '用户邀请码',
  session_id VARCHAR(36) COMMENT '会话ID',
  raw_text TEXT COMMENT '原始文本',
  parsed_data JSON COMMENT '解析后的结构化数据',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  FOREIGN KEY (user_id) REFERENCES users(invite_code) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_session_id (session_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='简历表';

