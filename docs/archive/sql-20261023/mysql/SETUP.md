# MySQL 快速设置指南

## 已创建的文件

1. **`mysql/schema.sql`** - MySQL 数据库表结构定义
2. **`lib/inviteCode.ts`** - 邀请码生成工具
3. **`lib/db.ts`** - 已更新，支持 MySQL 和邀请码系统
4. **`mysql/README.md`** - 详细的使用文档

## 快速开始

### 步骤 1: 安装 MySQL 驱动

```bash
npm install mysql2
```

### 步骤 2: 创建数据库

在你的 MySQL 客户端（命令行、MySQL Workbench、phpMyAdmin 等）中执行：

```bash
mysql -u root -p < mysql/schema.sql
```

或者：

1. 打开 MySQL 客户端
2. 执行 `mysql/schema.sql` 文件中的所有 SQL 语句

### 步骤 3: 配置环境变量

在项目根目录的 `.env.local` 文件中添加：

```env
# MySQL 配置
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=你的MySQL密码
MYSQL_DATABASE=ai_job_coach
```

### 步骤 4: 测试连接

重启开发服务器：

```bash
npm run dev
```

系统会自动连接到 MySQL 数据库。

## 邀请码系统

### 特点

- **自动生成**：创建新用户时自动生成唯一邀请码
- **格式**：6位大写字母+数字组合（如：`A1B2C3`）
- **唯一性**：自动检查重复，确保唯一
- **作为用户ID**：邀请码就是用户的唯一标识符

### 使用示例

```typescript
import { getOrCreateUser, getUserByInviteCode } from '@/lib/db';

// 自动生成邀请码创建用户
const inviteCode = await getOrCreateUser(
  undefined,  // inviteCode（不提供则自动生成）
  '13800138000',  // phone
  undefined,  // email
  '张三'  // nickname
);
console.log('用户邀请码:', inviteCode); // 例如: A1B2C3

// 使用已有邀请码获取用户信息
const user = await getUserByInviteCode('A1B2C3');
console.log('用户信息:', user);
```

## 数据库表位置

所有表都在 `ai_job_coach` 数据库中：

- `users` - 用户表（使用邀请码作为主键）
- `sessions` - 会话表
- `conversation_messages` - 对话消息表
- `whiteboard_states` - 白板状态表
- `user_progress` - 用户进度表
- `resumes` - 简历表

## 注意事项

1. 确保 MySQL 服务正在运行
2. 确保数据库用户有创建表和插入数据的权限
3. 如果遇到字符编码问题，确保数据库使用 `utf8mb4` 字符集

## 更多信息

查看 `mysql/README.md` 获取详细文档。

