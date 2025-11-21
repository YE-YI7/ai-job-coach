# Git 推送脚本
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "GitHub 代码推送助手" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查当前状态
Write-Host "[步骤 1/5] 检查 Git 状态..." -ForegroundColor Yellow
git status
Write-Host ""

# 检查代理配置
Write-Host "[步骤 2/5] 检查代理配置..." -ForegroundColor Yellow
$proxy = git config --global http.https://github.com.proxy
if ($proxy) {
    Write-Host "警告: 发现代理配置: $proxy" -ForegroundColor Red
    Write-Host "正在移除..." -ForegroundColor Yellow
    git config --global --unset http.https://github.com.proxy
    Write-Host "✓ 已移除代理配置" -ForegroundColor Green
} else {
    Write-Host "✓ 没有发现代理配置" -ForegroundColor Green
}
Write-Host ""

# 检查远程仓库
Write-Host "[步骤 3/5] 检查远程仓库..." -ForegroundColor Yellow
git remote -v
Write-Host ""

# 提示输入 Token
Write-Host "[步骤 4/5] 准备推送..." -ForegroundColor Yellow
Write-Host ""
Write-Host "请按以下步骤操作:" -ForegroundColor Cyan
Write-Host "1. 访问: https://github.com/settings/tokens" -ForegroundColor White
Write-Host "2. 生成新 token (必须勾选 'repo' 权限)" -ForegroundColor White
Write-Host "3. 复制完整 token" -ForegroundColor White
Write-Host ""
$token = Read-Host "请输入您的 GitHub Token (输入 token 后按回车)"

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "错误: Token 不能为空!" -ForegroundColor Red
    exit 1
}

# 验证 token 格式
if (-not $token.StartsWith("ghp_")) {
    Write-Host "警告: Token 格式可能不正确 (应该以 'ghp_' 开头)" -ForegroundColor Yellow
    $continue = Read-Host "是否继续? (y/n)"
    if ($continue -ne "y") {
        exit 1
    }
}

# 执行推送
Write-Host ""
Write-Host "[步骤 5/5] 正在推送到 GitHub..." -ForegroundColor Yellow
Write-Host ""

$pushUrl = "https://$token@github.com/velmavalienteqejimu22-jpg/ai-job-coach.git"
Write-Host "使用以下 URL 推送: https://[TOKEN]@github.com/velmavalienteqejimu22-jpg/ai-job-coach.git" -ForegroundColor Gray
Write-Host ""

try {
    git push $pushUrl main
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "✓ 推送成功!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "查看仓库: https://github.com/velmavalienteqejimu22-jpg/ai-job-coach" -ForegroundColor Cyan
        Write-Host ""
        
        # 询问是否保存 token 到 remote URL
        $save = Read-Host "是否将 token 保存到 remote URL? (以后推送无需输入 token) (y/n)"
        if ($save -eq "y") {
            git remote set-url origin $pushUrl
            Write-Host "✓ 已保存到 remote URL" -ForegroundColor Green
        }
    } else {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Red
        Write-Host "✗ 推送失败!" -ForegroundColor Red
        Write-Host "========================================" -ForegroundColor Red
        Write-Host ""
        Write-Host "可能的原因:" -ForegroundColor Yellow
        Write-Host "1. Token 权限不足 (需要 'repo' 权限)" -ForegroundColor White
        Write-Host "2. Token 已过期或无效" -ForegroundColor White
        Write-Host "3. 仓库不存在或没有权限" -ForegroundColor White
        Write-Host "4. 网络连接问题" -ForegroundColor White
        Write-Host ""
        Write-Host "详细解决方案请查看: 解决403错误.md" -ForegroundColor Cyan
        exit 1
    }
} catch {
    Write-Host "推送过程中出现错误: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

