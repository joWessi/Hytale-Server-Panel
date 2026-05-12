// Hytale Panel - Entry point
const express = require('express');
const cookieParser = require('cookie-parser');
const WebSocket = require('ws');
const path = require('path');
const pkg = require('../package.json');
const config = require('./config');

const { ensureDefaultAdmin } = require('./data/users');
const { ensureDefaults } = require('./data/settings');
ensureDefaultAdmin();
ensureDefaults();

const { helmetMiddleware, apiLimiter } = require('./middleware/security');

const app = express();
app.set('trust proxy', 'loopback');
app.use(helmetMiddleware);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiLimiter);

app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    // JS/HTML must always be fresh — the panel is updated server-side and the
    // browser otherwise hangs on to old modules until a hard reload.
    if (/\.(html|js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300');
    }
  },
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: pkg.version });
});

app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/server'));
app.use('/api', require('./routes/console'));
app.use('/api', require('./routes/files'));
app.use('/api', require('./routes/config'));
app.use('/api', require('./routes/backups'));
app.use('/api', require('./routes/scheduler'));
app.use('/api', require('./routes/users'));
app.use('/api', require('./routes/settings'));
app.use('/api', require('./routes/system'));
app.use('/api', require('./routes/dashboard'));
app.use('/api', require('./routes/players'));
app.use('/api', require('./routes/setup'));
app.use('/api', require('./routes/internal'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const server = app.listen(config.PORT, config.BIND_HOST, () => {
  console.log(`Hytale Panel v${pkg.version} running on ${config.BIND_HOST}:${config.PORT}`);
});

// Multiple WS endpoints on one HTTP server: use noServer + manual dispatch
// (two ws.Server instances both listening on `upgrade` race each other).
const wssConsole = new WebSocket.Server({ noServer: true });
const wssSetup = new WebSocket.Server({ noServer: true });

const { setupConsoleWebSocket } = require('./routes/console');
const { setupSetupWebSocket } = require('./routes/setup');
setupConsoleWebSocket(wssConsole);
setupSetupWebSocket(wssSetup);

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname === '/ws/console') {
    wssConsole.handleUpgrade(req, socket, head, (ws) => wssConsole.emit('connection', ws, req));
  } else if (pathname === '/ws/setup') {
    wssSetup.handleUpgrade(req, socket, head, (ws) => wssSetup.emit('connection', ws, req));
  } else {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  }
});

const { scheduleJobs, checkMissedJobs } = require('./services/scheduler');
const { startMonitoring } = require('./services/metrics');
const { syncWhitelist } = require('./services/whitelist');
const { start: startConnectionTracker } = require('./services/connection-tracker');

scheduleJobs();
checkMissedJobs();
startMonitoring();
syncWhitelist();
startConnectionTracker();

function shutdown() {
  console.log('Shutting down...');
  try { wssConsole.clients.forEach(c => c.terminate()); } catch {}
  try { wssSetup.clients.forEach(c => c.terminate()); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
