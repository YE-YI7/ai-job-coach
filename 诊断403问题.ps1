# GitHub 推送 403 错误诊断工具
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "GitHub 推送 403 错误诊断工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检查代理配置
Write-Host "[1/7] 检查代理配置..." -ForegroundColor Yellow
$proxy = git config --global http.https://github.com.proxy 2>&1
if ($proxy -and $proxy -notmatch "exit code|fatal") {
    Write-Host "  ✗ 发现代理配置: $proxy" -ForegroundColor Red
    Write-Host "  建议: 移除代理配置" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ 未发现代理配置" -ForegroundColor Green
}
Write-Host ""

# 2. 检查远程仓库
Write-Host "[2/7] 检查远程仓库..." -ForegroundColor Yellow
$remotes = git remote -v 2>&1
if ($remotes) {
    Write-Host "  远程仓库配置:" -ForegroundColor Gray
    $remotes | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    
    # 检查仓库URL格式
    if ($remotes -match "github\.com/velmavalienteqejimu22-jpg/ai-job-coach\.git") {
        Write-Host "  ✓ 仓库 URL 格式正确" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ 仓库 URL 可能不正确" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✗ 未配置远程仓库" -ForegroundColor Red
}
Write-Host ""

# 3. 检查用户配置
Write-Host "[3/7] 检查 Git 用户配置..." -ForegroundColor Yellow
$userName = git config --global user.name 2>&1
$userEmail = git config --global user.email 2>&1
Write-Host "  用户名: $userName" -ForegroundColor Gray
Write-Host "  邮箱: $userEmail" -ForegroundColor Gray
if ($userName -match "velmavalienteqejimu22") {
    Write-Host "  ✓ 用户名匹配" -ForegroundColor Green
} else {
    Write-Host "  ⚠ 用户名可能不匹配" -ForegroundColor Yellow
}
Write-Host ""

# 4. 检查本地提交
Write-Host "[4/7] 检查本地提交..." -ForegroundColor Yellow
$localCommits = git log --oneline -3 2>&1
if ($localCommits) {
    Write-Host "  最近的提交:" -ForegroundColor Gray
    $localCommits | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} else {
    Write-Host "  ⚠ 无法获取本地提交" -ForegroundColor Yellow
}
Write-Host ""

# 5. 检查 Windows 凭据管理器
Write-Host "[5/7] 检查 Windows 凭据管理器..." -ForegroundColor Yellow
try {
    $creds = cmdkey /list 2>&1 | Select-String -Pattern "git|github" -CaseSensitive:$false
    if ($creds) {
        Write-Host "  发现以下凭据:" -ForegroundColor Gray
        $creds | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
        Write-Host "  ⚠ 可能存在旧的凭据干扰" -ForegroundColor Yellow
        Write-Host "  建议: 手动清除这些凭据" -ForegroundColor Yellow
    } else {
        Write-Host "  ✓ 未发现相关凭据" -ForegroundColor Green
    }
} catch {
    Write-Host "  ⚠ 无法检查凭据管理器" -ForegroundColor Yellow
}
Write-Host ""

# 6. 测试 Token（如果有提供）
Write-Host "[6/7] Token 验证（可选）..." -ForegroundColor Yellow
$token = Read-Host "请输入您的 GitHub Token 进行测试（或直接按回车跳过）"

if (-not [string]::IsNullOrWhiteSpace($token)) {
    Write-Host ""
    Write-Host "  正在测试 Token..." -ForegroundColor Gray
    
    # 验证 Token 格式
    if (-not $token.StartsWith("ghp_")) {
        Write-Host "  ⚠ 警告: Token 格式可能不正确（应该以 'ghp_' 开头）" -ForegroundColor Yellow
    }
    
    # 测试 Token 长度
    if ($token.Length -lt 40 -or $token.Length -gt 60) {
        Write-Host "  ⚠ 警告: Token 长度可能不正确（通常为 40-50 个字符）" -ForegroundColor Yellow
    }
    
    # 测试 Token 是否有效
    try {
        $headers = @{
            "Authorization" = "token $token"
            "Accept" = "application/vnd.github.v3+json"
        }
        
        # 测试用户信息
        Write-Host "  测试 1: 验证 Token 有效性..." -ForegroundColor Gray
        $user = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers -ErrorAction Stop
        Write-Host "    ✓ Token 有效！用户: $($user.login)" -ForegroundColor Green
        
        # 测试仓库访问
        Write-Host "  测试 2: 验证仓库访问权限..." -ForegroundColor Gray
        try {
            $repo = Invoke-RestMethod -Uri "https://api.github.com/repos/velmavalienteqejimu22-jpg/ai-job-coach" -Headers $headers -ErrorAction Stop
            Write-Host "    ✓ 可以访问仓库: $($repo.full_name)" -ForegroundColor Green
            
            # 检查权限
            if ($repo.permissions) {
                Write-Host "    权限详情:" -ForegroundColor Gray
                Write-Host "      - 推送权限: $($repo.permissions.push)" -ForegroundColor $(if ($repo.permissions.push) { "Green" } else { "Red" })
                Write-Host "      - 拉取权限: $($repo.permissions.pull)" -ForegroundColor $(if ($repo.permissions.pull) { "Green" } else { "Red" })
                Write-Host "      - 管理员权限: $($repo.permissions.admin)" -ForegroundColor $(if ($repo.permissions.admin) { "Green" } else { "Gray" })
                
                if (-not $repo.permissions.push) {
                    Write-Host ""
                    Write-Host "    ✗ 错误: Token 没有推送权限！" -ForegroundColor Red
                    Write-Host "    解决: 重新生成 Token，确保勾选 'repo' 权限" -ForegroundColor Yellow
                }
            }
        } catch {
            Write-Host "    ✗ 无法访问仓库: $_" -ForegroundColor Red
            Write-Host "    可能原因:" -ForegroundColor Yellow
            Write-Host "      - 仓库不存在" -ForegroundColor White
            Write-Host "      - 您没有访问权限" -ForegroundColor White
            Write-Host "      - 仓库名称或用户名不正确" -ForegroundColor White
        }
        
        # 测试 Token 权限范围
        Write-Host "  测试 3: 检查 Token 权限范围..." -ForegroundColor Gray
        try {
            $authHeaders = @{
                "Authorization" = "token $token"
                "Accept" = "application/vnd.github.v3+json"
            }
            $scopes = (Invoke-WebRequest -Uri "https://api.github.com" -Headers $authHeaders -UseBasicParsing).Headers["X-OAuth-Scopes"]
            if ($scopes) {
                Write-Host "    Token 权限范围: $scopes" -ForegroundColor Gray
                if ($scopes -match "repo") {
                    Write-Host "    ✓ Token 包含 'repo' 权限" -ForegroundColor Green
                } else {
                    Write-Host "    ✗ Token 不包含 'repo' 权限！" -ForegroundColor Red
                    Write-Host "    解决: 重新生成 Token，确保勾选 'repo' 权限" -ForegroundColor Yellow
                }
            } else {
                Write-Host "    ⚠ 无法获取权限范围信息" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "    ⚠ 无法检查权限范围: $_" -ForegroundColor Yellow
        }
        
    } catch {
        Write-Host "    ✗ Token 无效或已过期: $_" -ForegroundColor Red
        Write-Host "    解决: 重新生成 Token" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⏭ 跳过 Token 测试" -ForegroundColor Gray
}
Write-Host ""

# 7. 推送建议
Write-Host "[7/7] 推送建议..." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "推荐推送方法" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "方法 1: 直接在 URL 中使用 Token（最简单）" -ForegroundColor Yellow
Write-Host '  git push https://YOUR_TOKEN@github.com/velmavalienteqejimu22-jpg/ai-job-coach.git main' -ForegroundColor White
Write-Host ""

Write-Host "方法 2: 更新 remote URL（一次设置）" -ForegroundColor Yellow
Write-Host '  git remote set-url origin https://YOUR_TOKEN@github.com/velmavalienteqejimu22-jpg/ai-job-coach.git' -ForegroundColor White
Write-Host '  git push -u origin main' -ForegroundColor White
Write-Host ""

Write-Host "方法 3: 使用环境变量（临时）" -ForegroundColor Yellow
Write-Host '  $env:GIT_ASKPASS = "echo"' -ForegroundColor White
Write-Host '  git push https://YOUR_TOKEN@github.com/velmavalienteqejimu22-jpg/ai-job-coach.git main' -ForegroundColor White
Write-Host '  Remove-Item Env:\GIT_ASKPASS' -ForegroundColor White
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "诊断完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "如果问题仍然存在，请查看详细文档: 彻底解决403问题.md" -ForegroundColor Cyan
Write-Host ""

