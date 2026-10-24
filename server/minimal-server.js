const http = require('http');

const server = http.createServer((req, res) => {
  console.log(`[MIN] ${req.method} ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
});

server.on('error', (err) => {
  console.error('[MIN] Error:', err.message);
});

server.listen(5002, '0.0.0.0', () => {
  console.log('[MIN] Listening on 0.0.0.0:5002');
});

server.on('listening', () => {
  console.log('[MIN] Listening event fired');
});

setInterval(() => {
  console.log('[MIN] Still alive', new Date().toISOString());
}, 5000);

process.on('uncaughtException', (err) => {
  console.error('[MIN] Uncaught exception:', err.message);
});
