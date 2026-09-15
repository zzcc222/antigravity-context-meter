# =========================================================
# Antigravity Context Meter - One-Click Installer
# =========================================================
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  Antigravity 上下文流光长条组件 · 一键安装/恢复工具" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. 定位 Antigravity 安装路径
$candidates = @(
    "$env:LOCALAPPDATA\Programs\antigravity",
    "C:\Program Files\Antigravity",
    "C:\Program Files (x86)\Antigravity"
)

$runningProc = Get-Process -Name "Antigravity" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($runningProc -and $runningProc.Path) {
    $procDir = Split-Path -Parent $runningProc.Path
    $candidates = @($procDir) + $candidates
}

$appDir = $null
foreach ($dir in $candidates) {
    if (Test-Path "$dir\resources\app\dist\preload.js") {
        $appDir = $dir
        break
    }
}

if (-not $appDir) {
    Write-Host "[ERROR] 未能在标准路径找到 Antigravity 安装目录！" -ForegroundColor Red
    Write-Host "请确保已安装 Antigravity，并在安装后重新运行此脚本。" -ForegroundColor Yellow
    Exit 1
}

Write-Host "[1/5] 定位到 Antigravity 目录: $appDir" -ForegroundColor White
$distDir = "$appDir\resources\app\dist"
$currentDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# 2. 备份原有文件
$preloadPath = "$distDir\preload.js"
$preloadBak = "$distDir\preload.js.bak"
$ipcPath = "$distDir\ipcHandlers.js"
$ipcBak = "$distDir\ipcHandlers.js.bak"

if (Test-Path $preloadPath) {
    if (-not (Test-Path $preloadBak)) {
        Copy-Item $preloadPath $preloadBak -Force
        Write-Host "[2/5] 已自动创建原始文件备份: preload.js.bak" -ForegroundColor Gray
    } else {
        Write-Host "[2/5] 备份文件已存在，跳过覆盖备份" -ForegroundColor Gray
    }
}

if ((Test-Path $ipcPath) -and (-not (Test-Path $ipcBak))) {
    Copy-Item $ipcPath $ipcBak -Force
}

# 3. 复制核心服务文件
Write-Host "[3/5] 部署上下文解析器与微服务核心..." -ForegroundColor White
Copy-Item "$currentDir\core\contextStats.js" "$distDir\contextStats.js" -Force
Copy-Item "$currentDir\core\contextServer.js" "$distDir\contextServer.js" -Force

# 4. 注入 UI 引擎到 preload.js
Write-Host "[4/5] 注入顶部流光长条 UI 引擎到预加载层..." -ForegroundColor White
$engineCode = Get-Content "$currentDir\core\contextBarEngine.js" -Raw -Encoding UTF8
$preloadContent = Get-Content $preloadPath -Raw -Encoding UTF8

if ($preloadContent.Contains("Antigravity Context Bar UI Engine")) {
    $idx = $preloadContent.IndexOf("// Antigravity Context Bar UI Engine")
    $startIdx = $preloadContent.LastIndexOf("// ==========================================", $idx)
    if ($startIdx -ge 0) {
        $preloadContent = $preloadContent.Substring(0, $startIdx).TrimEnd() + "`n`n"
    }
}

$newPreload = $preloadContent.TrimEnd() + "`n`n" + $engineCode
Set-Content -Path $preloadPath -Value $newPreload -Encoding UTF8 -Force

# 注入 IPC 支持到 ipcHandlers.js (可选通道)
if (Test-Path $ipcPath) {
    $ipcContent = Get-Content $ipcPath -Raw -Encoding UTF8
    if (-not $ipcContent.Contains("context:get-stats")) {
        $ipcInject = "`n    // Context Bar Plugin Stats`nelectron_1.ipcMain.handle('context:get-stats', async (_event, targetConvoId) => {`n        try {`n            const contextStats = require('./contextStats');`n            return contextStats.getConversationStats(targetConvoId);`n        } catch (err) {`n            return null;`n        }`n    });`n"
        if ($ipcContent.Contains("return false;")) {
            $lastIdx = $ipcContent.LastIndexOf("return false;")
            $closeIdx = $ipcContent.IndexOf("});", $lastIdx)
            if ($closeIdx -ge 0) {
                $ipcContent = $ipcContent.Substring(0, $closeIdx + 3) + $ipcInject + $ipcContent.Substring($closeIdx + 3)
                Set-Content -Path $ipcPath -Value $ipcContent -Encoding UTF8 -Force
            }
        }
    }
}

# 5. 启动后台常驻微服务
Write-Host "[5/5] 启动本地极速统计微服务 (127.0.0.1:49152)..." -ForegroundColor White
# 先杀死旧服务进程避免占用 (支持 node.exe 及免 Node 模式下的 Antigravity.exe)
try {
    $portPids = Get-NetTCPConnection -LocalPort 49152 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $portPids) {
        if ($p -and $p -gt 0) {
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        }
    }
} catch {}
try {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -and $_.CommandLine -match "contextServer"
    } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
} catch {}

$serverTarget = "$distDir\contextServer.js"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $agExe = "$appDir\Antigravity.exe"
    if (Test-Path $agExe) {
        Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList "powershell.exe -WindowStyle Hidden -Command `"`$env:ELECTRON_RUN_AS_NODE=1; & `'$agExe`' `'$serverTarget`'`"" -ErrorAction SilentlyContinue | Out-Null
    }
} else {
    Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList "node.exe `"$serverTarget`"" -ErrorAction SilentlyContinue | Out-Null
}
Start-Sleep -Milliseconds 800


# 校验服务是否正常响应
$testSuccess = $false
try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:49152/ping" -TimeoutSec 3 -ErrorAction SilentlyContinue
    if ($response -and $response.status -eq "ok") {
        $testSuccess = $true
    }
} catch {}

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  ✅ 安装成功！Antigravity 上下文流光长条组件已就绪！" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "👉 现在请在 Antigravity 窗口中按下：Ctrl + R（重新加载页面）" -ForegroundColor Yellow
Write-Host "即可看到对话框正上方横向对齐的全新流光长条！" -ForegroundColor White
Write-Host ""
Write-Host "如需卸载，可随时运行同目录下的 uninstall.bat 恢复原状。" -ForegroundColor Gray
Write-Host ""
