# 清除 Git 和 GitHub 相关的旧凭据
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "清除旧的 Git 凭据" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 列出所有 Git 相关的凭据
Write-Host "[步骤 1/3] 查找 Git 相关凭据..." -ForegroundColor Yellow
$credentials = cmdkey /list 2>&1 | Select-String -Pattern "git|github" -CaseSensitive:$false
if ($credentials) {
    Write-Host "发现以下凭据:" -ForegroundColor Yellow
    $credentials | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    Write-Host ""
} else {
    Write-Host "未发现 Git 相关凭据" -ForegroundColor Green
    Write-Host ""
}

# 清除 Git 凭据管理器的凭据
Write-Host "[步骤 2/3] 清除 Git 凭据管理器凭据..." -ForegroundColor Yellow
try {
    # 清除 GitHub 凭据
    git credential-manager erase <<< "protocol=https
host=github.com
" 2>&1 | Out-Null
    Write-Host "✓ 已清除 GitHub 凭据" -ForegroundColor Green
} catch {
    Write-Host "! 无法使用 git credential-manager（可能需要手动清除）" -ForegroundColor Yellow
}
Write-Host ""

# 提示手动清除 Windows 凭据
Write-Host "[步骤 3/3] 需要手动清除 Windows 凭据管理器中的旧凭据" -ForegroundColor Yellow
Write-Host ""
Write-Host "请按以下步骤操作:" -ForegroundColor Cyan
Write-Host "1. 按 Win + R 打开运行对话框" -ForegroundColor White
Write-Host "2. 输入: control /name Microsoft.CredentialManager" -ForegroundColor White
Write-Host "3. 点击 'Windows 凭据'" -ForegroundColor White
Write-Host "4. 找到包含 'git' 或 'github' 的条目" -ForegroundColor White
Write-Host "5. 点击条目，选择 '删除'" -ForegroundColor White
Write-Host ""
Write-Host "或者，我可以尝试使用命令行清除..." -ForegroundColor Yellow
$clear = Read-Host "是否现在尝试清除? (y/n)"

if ($clear -eq "y") {
    Write-Host ""
    Write-Host "尝试清除 Windows 凭据..." -ForegroundColor Yellow
    
    # 尝试清除特定的凭据
    $credToDelete = "LegacyGeneric:target=GitHub - https://api.github.com/velmavalienteqejimu22-jpg"
    cmdkey /delete:"$credToDelete" 2>&1 | Out-Null
    
    # 尝试清除通用 GitHub 凭据
    cmdkey /delete:"git:https://github.com" 2>&1 | Out-Null
    
    Write-Host "✓ 已尝试清除凭据" -ForegroundColor Green
    Write-Host ""
    Write-Host "如果仍有问题，请手动清除（见上方说明）" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "请手动清除旧凭据后再继续" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "清除完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "接下来请使用以下命令推送（替换 YOUR_TOKEN）:" -ForegroundColor Cyan
Write-Host 'git push https://YOUR_TOKEN@github.com/velmavalienteqejimu22-jpg/ai-job-coach.git main' -ForegroundColor White
Write-Host ""

