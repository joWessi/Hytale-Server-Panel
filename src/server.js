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
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache');
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
app.use('/api', require('./routes/internal'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const server = app.listen(config.PORT, config.BIND_HOST, () => {
  console.log(`Hytale Panel v${pkg.version} running on ${config.BIND_HOST}:${config.PORT}`);
});

const wss = new WebSocket.Server({ server, path: '/ws/console' });
const { setupConsoleWebSocket } = require('./routes/console');
setupConsoleWebSocket(wss);

const { scheduleJobs, checkMissedJobs } = require('./services/scheduler');
const { startMonitoring } = require('./services/metrics');
const { syncWhitelist } = require('./services/whitelist');

scheduleJobs();
checkMissedJobs();
startMonitoring();
syncWhitelist();

function shutdown() {
  console.log('Shutting down...');
  try { wss.clients.forEach(c => c.terminate()); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
