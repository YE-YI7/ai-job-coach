# MySQL 数据库配置指南

## 概述

本项目支持使用 MySQL 作为数据库，并使用**邀请码**作为用户的唯一标识符。

## 数据库结构

所有表结构定义在 `mysql/schema.sql` 文件中。

### 主要特性

- **邀请码作为用户ID**：每个用户都有一个唯一的邀请码（6-20位字母数字组合）
- **支持多会话**：每个用户可以创建多个会话
- **消息持久化**：所有对话消息都会保存到数据库
- **白板状态**：支持保存和恢复白板状态
- **用户进度跟踪**：记录用户当前所处的阶段

## 安装步骤

### 1. 创建数据库

在 MySQL 中执行 `schema.sql` 文件：

```bash
mysql -u root -p < mysql/schema.sql
```

或者使用 MySQL Workbench、phpMyAdmin 等工具导入 `mysql/schema.sql` 文件。

### 2. 安装 Node.js MySQL 驱动

```bash
npm install mysql2
```

### 3. 配置环境变量

在 `.env.local` 文件中添加以下配置：

```env
# MySQL 配置
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=ai_job_coach
```

### 4. 数据库优先级

系统会按以下优先级选择数据库：

1. **Supabase**（如果配置了 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`）
2. **PostgreSQL**（如果配置了 `POSTGRES_URL`）
3. **MySQL**（如果配置了 `MYSQL_HOST`、`MYSQL_USER`、`MYSQL_PASSWORD`）

## 邀请码系统

### 邀请码格式

- 长度：默认 6 位（可配置）
- 字符集：大写字母和数字（排除容易混淆的字符：0, O, I, 1）
- 示例：`A1B2C3`、`XY9Z8W`

### 自动生成

系统会在创建新用户时自动生成唯一的邀请码。生成逻辑在 `lib/inviteCode.ts` 中。

### 使用邀请码登录

用户可以使用邀请码作为唯一标识符登录系统，无需手机号或邮箱。

## API 使用示例

### 创建用户（自动生成邀请码）

```typescript
import { getOrCreateUser } from '@/lib/db';

// 自动生成邀请码
const inviteCode = await getOrCreateUser(undefined, undefined, undefined, '用户昵称');
console.log('生成的邀请码:', inviteCode);
```

### 使用已有邀请码创建用户

```typescript
// 使用指定的邀请码
const inviteCode = await getOrCreateUser('ABC123', '13800138000', undefined, '用户昵称');
```

### 通过邀请码获取用户信息

```typescript
import { getUserByInviteCode } from '@/lib/db';

const user = await getUserByInviteCode('ABC123');
if (user) {
  console.log('用户信息:', user);
}
```

## 表结构说明

### users 表

- `invite_code` (VARCHAR(20), PRIMARY KEY): 邀请码，作为用户唯一ID
- `phone` (VARCHAR(20), UNIQUE): 手机号（可选）
- `email` (VARCHAR(100), UNIQUE): 邮箱（可选）
- `nickname` (VARCHAR(50)): 昵称
- `provider`: 注册方式
- `created_at`: 创建时间
- `last_active`: 最后活跃时间

### sessions 表

- `id` (VARCHAR(36), PRIMARY KEY): 会话ID（UUID）
- `user_id` (VARCHAR(20)): 用户邀请码（外键）
- `created_at`: 创建时间
- `updated_at`: 更新时间

### conversation_messages 表

- `id` (VARCHAR(36), PRIMARY KEY): 消息ID（UUID）
- `session_id` (VARCHAR(36)): 会话ID（外键）
- `role`: 角色（user/assistant/system）
- `content`: 消息内容
- `stage`: 当前阶段
- `created_at`: 创建时间

### whiteboard_states 表

- `id` (VARCHAR(36), PRIMARY KEY): 白板ID（UUID）
- `session_id` (VARCHAR(36), UNIQUE): 会话ID（外键）
- `whiteboard` (JSON): 白板状态数据
- `updated_at`: 更新时间

### user_progress 表

- `id` (VARCHAR(36), PRIMARY KEY): 进度ID（UUID）
- `user_id` (VARCHAR(20), UNIQUE): 用户邀请码（外键）
- `current_stage`: 当前阶段
- `updated_at`: 更新时间

### resumes 表

- `id` (VARCHAR(36), PRIMARY KEY): 简历ID（UUID）
- `user_id` (VARCHAR(20)): 用户邀请码（外键）
- `session_id` (VARCHAR(36)): 会话ID（外键）
- `raw_text`: 原始文本
- `parsed_data` (JSON): 解析后的结构化数据
- `created_at`: 创建时间

## 注意事项

1. **字符集**：确保 MySQL 使用 `utf8mb4` 字符集以支持 emoji 和特殊字符
2. **时区**：建议设置 MySQL 时区为 UTC 或与服务器时区一致
3. **备份**：定期备份数据库，特别是用户数据和会话数据
4. **性能**：对于大量数据，考虑添加适当的索引（已在 schema.sql 中定义）

## 故障排除

### 连接失败

- 检查 MySQL 服务是否运行
- 验证用户名和密码是否正确
- 确认数据库是否存在
- 检查防火墙设置

### 字符编码问题

确保数据库和表都使用 `utf8mb4` 字符集：

```sql
ALTER DATABASE ai_job_coach CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 邀请码重复

虽然概率极低，但如果遇到邀请码重复的情况，系统会自动增加邀请码长度重试。

