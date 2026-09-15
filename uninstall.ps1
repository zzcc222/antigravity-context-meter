# =========================================================
# Antigravity Context Meter - One-Click Uninstaller
# =========================================================
$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  Antigravity 上下文流光长条组件 · 一键卸载工具" -ForegroundColor Yellow
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

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
    Write-Host "[WARN] 未能找到 Antigravity 目录，已清理相关常驻进程。" -ForegroundColor Yellow
} else {
    $distDir = "$appDir\resources\app\dist"
    $preloadPath = "$distDir\preload.js"
    $preloadBak = "$distDir\preload.js.bak"
    $ipcPath = "$distDir\ipcHandlers.js"
    $ipcBak = "$distDir\ipcHandlers.js.bak"

    # 1. 恢复 preload.js
    if (Test-Path $preloadBak) {
        Copy-Item $preloadBak $preloadPath -Force
        Remove-Item $preloadBak -Force
        Write-Host "[1/3] 已成功还原 preload.js 至初始状态" -ForegroundColor Green
    } else {
        # 移除注入的代码段
        if (Test-Path $preloadPath) {
            $content = Get-Content $preloadPath -Raw -Encoding UTF8
            if ($content.Contains("Antigravity Context Bar UI Engine")) {
                $idx = $content.IndexOf("// Antigravity Context Bar UI Engine")
                $startIdx = $content.LastIndexOf("// ==========================================", $idx)
                if ($startIdx -ge 0) {
                    $content = $content.Substring(0, $startIdx).TrimEnd() + "`n"
                    Set-Content $preloadPath -Value $content -Encoding UTF8 -Force
                    Write-Host "[1/3] 已成功移除 preload.js 中的长条组件代码" -ForegroundColor Green
                }
            }
        }
    }

    # 2. 恢复 ipcHandlers.js
    if (Test-Path $ipcBak) {
        Copy-Item $ipcBak $ipcPath -Force
        Remove-Item $ipcBak -Force
        Write-Host "[2/3] 已成功还原 ipcHandlers.js" -ForegroundColor Green
    }

    # 3. 移除核心文件
    Remove-Item "$distDir\contextStats.js" -Force
    Remove-Item "$distDir\contextServer.js" -Force
    Write-Host "[3/3] 已清理核心统计组件" -ForegroundColor Green
}

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

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  ✅ 卸载完成！所有组件已彻底清除并还原原始状态。" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "请在 Antigravity 窗口中按下 Ctrl + R 即可生效。" -ForegroundColor White
Write-Host ""
