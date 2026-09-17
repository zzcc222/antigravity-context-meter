const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync, spawn } = require('child_process');

console.log('\x1b[36m=========================================================\x1b[0m');
console.log('\x1b[32m  Antigravity 上下文流光长条组件 · 一键安装/恢复工具\x1b[0m');
console.log('\x1b[36m=========================================================\x1b[0m\n');

// 1. 定位 Antigravity 安装目录
const candidates = [
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'antigravity'),
  'C:\\Program Files\\Antigravity',
  'C:\\Program Files (x86)\\Antigravity'
];

let appDir = null;
for (const dir of candidates) {
  if (fs.existsSync(path.join(dir, 'resources', 'app', 'dist', 'preload.js'))) {
    appDir = dir;
    break;
  }
}

if (!appDir) {
  console.error('\x1b[31m[ERROR] 未能在标准路径找到 Antigravity 安装目录！\x1b[0m');
  console.error('请确认已安装 Antigravity 后再运行此程序。');
  process.exit(1);
}

console.log(`\x1b[37m[1/5] 定位到 Antigravity 目录: ${appDir}\x1b[0m`);
const distDir = path.join(appDir, 'resources', 'app', 'dist');
const currentDir = __dirname;

// 2. 备份原始文件
const preloadPath = path.join(distDir, 'preload.js');
const preloadBak = path.join(distDir, 'preload.js.bak');
const ipcPath = path.join(distDir, 'ipcHandlers.js');
const ipcBak = path.join(distDir, 'ipcHandlers.js.bak');

if (fs.existsSync(preloadPath) && !fs.existsSync(preloadBak)) {
  fs.copyFileSync(preloadPath, preloadBak);
  console.log('\x1b[90m[2/5] 已自动创建原始文件备份: preload.js.bak\x1b[0m');
} else {
  console.log('\x1b[90m[2/5] 备份文件已就绪\x1b[0m');
}

if (fs.existsSync(ipcPath) && !fs.existsSync(ipcBak)) {
  fs.copyFileSync(ipcPath, ipcBak);
}

// 3. 复制核心服务文件
console.log('\x1b[37m[3/5] 部署上下文统计核心与微服务组件...\x1b[0m');
fs.copyFileSync(path.join(currentDir, 'core', 'contextStats.js'), path.join(distDir, 'contextStats.js'));
fs.copyFileSync(path.join(currentDir, 'core', 'contextServer.js'), path.join(distDir, 'contextServer.js'));

// 4. 注入 UI 引擎到 preload.js
console.log('\x1b[37m[4/5] 注入顶部流光长条 UI 引擎到预加载层...\x1b[0m');
const engineCode = fs.readFileSync(path.join(currentDir, 'core', 'contextBarEngine.js'), 'utf8');
let preloadContent = fs.readFileSync(preloadPath, 'utf8');

const marker = '// Antigravity Context Bar UI Engine';
if (preloadContent.includes(marker)) {
  const idx = preloadContent.indexOf(marker);
  const startIdx = preloadContent.lastIndexOf('// ==========================================', idx);
  if (startIdx >= 0) {
    preloadContent = preloadContent.substring(0, startIdx).trimEnd() + '\n\n';
  }
}

fs.writeFileSync(preloadPath, preloadContent.trimEnd() + '\n\n' + engineCode, 'utf8');

// 注入 IPC 扩展到 ipcHandlers.js (可选通道)
if (fs.existsSync(ipcPath)) {
  let ipcContent = fs.readFileSync(ipcPath, 'utf8');
  if (!ipcContent.includes('context:get-stats')) {
    const ipcInject = `
    // Context Bar Plugin Stats
    electron_1.ipcMain.handle('context:get-stats', async (_event, targetConvoId) => {
        try {
            const contextStats = require('./contextStats');
            return contextStats.getConversationStats(targetConvoId);
        } catch (err) {
            return null;
        }
    });
`;
    const searchTarget = 'return false;\n        }\n    });';
    const lastIdx = ipcContent.lastIndexOf('return false;');
    if (lastIdx >= 0) {
      const closeIdx = ipcContent.indexOf('});', lastIdx);
      if (closeIdx >= 0) {
        ipcContent = ipcContent.substring(0, closeIdx + 3) + ipcInject + ipcContent.substring(closeIdx + 3);
        fs.writeFileSync(ipcPath, ipcContent, 'utf8');
      }
    }
  }
}

// 5. 启动后台独立微服务
console.log('\x1b[37m[5/5] 启动本地极速统计微服务 (127.0.0.1:49152)...\x1b[0m');
try {
  // 查找并停止旧服务 (支持占用 49152 端口的 node.exe 或 Antigravity.exe)
  const killCmd = `powershell -Command "try { $pids = Get-NetTCPConnection -LocalPort 49152 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($p in $pids) { if ($p -gt 0) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } } } catch {}; try { Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -match 'contextServer' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } } catch {}"`;
  execSync(killCmd, { stdio: 'ignore' });
} catch (e) {}

const serverTarget = path.join(distDir, 'contextServer.js');
const nodeBin = process.execPath;
try {
  // 通过 WMI 创建真正独立的系统级进程
  execSync(`powershell -Command "Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList '\\"${nodeBin}\\" \\"${serverTarget}\\"'"`, { stdio: 'ignore' });
} catch (e) {
  // 备选 spawn
  const child = spawn(nodeBin, [serverTarget], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}

setTimeout(() => {
  console.log('\n\x1b[32m=========================================================\x1b[0m');
  console.log('\x1b[32m  ✅ 安装成功！Antigravity 上下文流光长条组件已就绪！\x1b[0m');
  console.log('\x1b[32m=========================================================\x1b[0m\n');
  console.log('\x1b[33m👉 现在请在 Antigravity 窗口中按下：Ctrl + R（重新加载页面）\x1b[0m');
  console.log('即可看到对话框正上方横向严格对齐的流光上下文长条！\n');
  console.log('\x1b[90m如需卸载，可随时运行同目录下的 uninstall.bat 恢复原状。\x1b[0m\n');
}, 800);
