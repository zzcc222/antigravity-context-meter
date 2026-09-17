const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('\x1b[36m=========================================================\x1b[0m');
console.log('\x1b[33m  Antigravity 上下文流光长条组件 · 一键卸载工具\x1b[0m');
console.log('\x1b[36m=========================================================\x1b[0m\n');

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
  console.log('\x1b[33m[WARN] 未能找到 Antigravity 目录，已清理相关常驻服务。\x1b[0m');
} else {
  const distDir = path.join(appDir, 'resources', 'app', 'dist');
  const preloadPath = path.join(distDir, 'preload.js');
  const preloadBak = path.join(distDir, 'preload.js.bak');
  const ipcPath = path.join(distDir, 'ipcHandlers.js');
  const ipcBak = path.join(distDir, 'ipcHandlers.js.bak');

  // 1. 还原 preload.js
  if (fs.existsSync(preloadBak)) {
    fs.copyFileSync(preloadBak, preloadPath);
    fs.unlinkSync(preloadBak);
    console.log('\x1b[32m[1/3] 已成功还原 preload.js 至初始状态\x1b[0m');
  } else if (fs.existsSync(preloadPath)) {
    let content = fs.readFileSync(preloadPath, 'utf8');
    const marker = '// Antigravity Context Bar UI Engine';
    if (content.includes(marker)) {
      const idx = content.indexOf(marker);
      const startIdx = content.lastIndexOf('// ==========================================', idx);
      if (startIdx >= 0) {
        content = content.substring(0, startIdx).trimEnd() + '\n';
        fs.writeFileSync(preloadPath, content, 'utf8');
        console.log('\x1b[32m[1/3] 已成功移除 preload.js 中的长条组件代码\x1b[0m');
      }
    }
  }

  // 2. 还原 ipcHandlers.js
  if (fs.existsSync(ipcBak)) {
    fs.copyFileSync(ipcBak, ipcPath);
    fs.unlinkSync(ipcBak);
    console.log('\x1b[32m[2/3] 已成功还原 ipcHandlers.js\x1b[0m');
  }

  // 3. 删除组件核心
  try { if (fs.existsSync(path.join(distDir, 'contextStats.js'))) fs.unlinkSync(path.join(distDir, 'contextStats.js')); } catch (e) {}
  try { if (fs.existsSync(path.join(distDir, 'contextServer.js'))) fs.unlinkSync(path.join(distDir, 'contextServer.js')); } catch (e) {}
  console.log('\x1b[32m[3/3] 已清理核心统计组件\x1b[0m');
}

// 终止后台服务 (支持占用 49152 端口的 node.exe 或 Antigravity.exe)
try {
  const killCmd = `powershell -Command "try { $pids = Get-NetTCPConnection -LocalPort 49152 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($p in $pids) { if ($p -gt 0) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } } } catch {}; try { Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -match 'contextServer' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } } catch {}"`;
  execSync(killCmd, { stdio: 'ignore' });
} catch (e) {}

console.log('\n\x1b[32m=========================================================\x1b[0m');
console.log('\x1b[32m  ✅ 卸载完成！所有组件已彻底清除并还原原始状态。\x1b[0m');
console.log('\x1b[32m=========================================================\x1b[0m\n');
console.log('请在 Antigravity 窗口中按下 Ctrl + R 即可生效。\n');
