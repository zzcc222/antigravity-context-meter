const http = require('http');
const path = require('path');
const { getConversationStats } = require('./contextStats');

const PORT = 49152;
const startTime = Date.now();

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. 标准健康自检与在线状态心跳
  if (req.url === '/ping' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'antigravity-context-meter',
      version: '1.0.5',
      pid: process.pid,
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000)
    }));
    return;
  }

  // 2. 核心 Token 统计查询
  if (req.url.startsWith('/stats')) {
    try {
      const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
      const convoId = u.searchParams.get('convoId');
      // 正则校验 convoId 防范路径穿越
      if (convoId && !/^[0-9a-zA-Z_-]+$/.test(convoId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid conversation id' }));
        return;
      }
      const stats = getConversationStats(convoId);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(stats || {}));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[contextServer] Port ${PORT} already in use, another instance is active. Exiting cleanly.`);
    process.exit(0);
  } else {
    console.error('[contextServer] Server error:', err);
  }
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Context Stats HTTP Server listening on http://127.0.0.1:${PORT}`);
});

