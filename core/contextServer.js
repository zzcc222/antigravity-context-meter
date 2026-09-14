const http = require('http');
const path = require('path');
const { getConversationStats } = require('./contextStats');

const PORT = 49152;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url.startsWith('/stats')) {
    try {
      const u = new URL(req.url, 'http://127.0.0.1:49152');
      const convoId = u.searchParams.get('convoId');
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
    console.log(`[contextServer] Port ${PORT} already in use, continuing.`);
  } else {
    console.error('[contextServer] Server error:', err);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Context Stats HTTP Server listening on http://127.0.0.1:${PORT}`);
});
