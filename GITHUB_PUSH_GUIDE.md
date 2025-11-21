# GitHub 推送指南 - 已修复代理问题

## ✅ 已完成

- ✅ SOCKS5 代理配置已移除
- ✅ 本地更改已准备好推送

## 📤 推送到 GitHub 的步骤

### 方法 1：使用 Personal Access Token（推荐）

**步骤 1：生成 GitHub Token**

1. 访问：https://github.com/settings/tokens
2. 点击 "Generate new token" → "Generate new token (classic)"
3. 填写信息：
   - **Note**: `ai-job-coach-push`
   - **Expiration**: 选择有效期（建议 90 天或更长）
   - **权限**: 只勾选 ✅ `repo` 
4. 点击 "Generate token"
5. **立即复制 token**（只显示一次！格式类似：`ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`）

**步骤 2：使用 Token 推送**

在 PowerShell 中执行以下命令，将 `YOUR_TOKEN` 替换为您刚才复制的 token：

```powershell
git push https://YOUR_TOKEN@github.com/velmavalienteqejimu22-jpg/ai-job-coach.git main
```

**示例**（如果 token 是 `ghp_abc123def456...`）：
```powershell
git push https://ghp_abc123def456@github.com/velmavalienteqejimu22-jpg/ai-job-coach.git main
```

### 方法 2：更新 remote URL（一次设置，后续直接 push）

**步骤 1：生成 Token**（同方法 1 的步骤 1）

**步骤 2：更新 remote URL**

```powershell
git remote set-url origin https://YOUR_TOKEN@github.com/velmavalienteqejimu22-jpg/ai-job-coach.git
git push -u origin main
```

## 🔍 验证推送成功

推送成功后，访问以下 URL 查看：
https://github.com/velmavalienteqejimu22-jpg/ai-job-coach

如果看到您的最新提交（包括 README.md 更新），说明推送成功！

## ⚠️ 常见问题

### 问题 1：提示 "Permission denied"
**解决**：确保 token 有 `repo` 权限，并且 token 已正确复制（没有多空格或换行）

### 问题 2：提示 "Repository not found"
**解决**：
1. 确认仓库存在：https://github.com/velmavalienteqejimu22-jpg/ai-job-coach
2. 确认您是仓库所有者
3. 检查仓库名称是否正确

### 问题 3：提示 "Invalid credentials"
**解决**：
- Token 可能已过期，重新生成一个新 token
- 检查 token 是否完整复制

## 📝 重要提示

- Token 等同于密码，请妥善保管
- 不要将 token 提交到代码仓库
- 如果不小心泄露，立即到 GitHub 上删除该 token
- 代理配置已移除，不会再次出现 403 错误

## 🚀 快速执行

如果您已经准备好 token，直接在 PowerShell 执行：

```powershell
# 替换 YOUR_TOKEN 为您的实际 token
git push https://YOUR_TOKEN@github.com/velmavalienteqejimu22-jpg/ai-job-coach.git main
```

