// Hytale Panel v4.0.0 - Entry point
const express = require('express');
const cookieParser = require('cookie-parser');
const WebSocket = require('ws');
const path = require('path');
const config = require('./config');

// Initialize data layer (ensure files/dirs exist)
const { ensureDefaultAdmin } = require('./data/users');
const { ensureDefaults } = require('./data/settings');
ensureDefaultAdmin();
ensureDefaults();

// Middleware
const { helmetMiddleware, apiLimiter } = require('./middleware/security');

const app = express();
app.use(helmetMiddleware);
app.use(cookieParser());
app.use(express.json());
app.use('/api', apiLimiter);

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Routes
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
app.use('/api', require('./routes/update'));

// SPA fallback: serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start HTTP server (bind to localhost only - Nginx handles external access)
const server = app.listen(config.PORT, config.BIND_HOST, () => {
  console.log(`Hytale Panel v4.0.0 running on ${config.BIND_HOST}:${config.PORT}`);
});

// WebSocket server for live console
const wss = new WebSocket.Server({ server, path: '/ws/console' });
const { setupConsoleWebSocket } = require('./routes/console');
setupConsoleWebSocket(wss);

// Start scheduler and monitoring
const { scheduleJobs, checkMissedJobs } = require('./services/scheduler');
const { startMonitoring } = require('./services/metrics');
const { syncWhitelist } = require('./services/whitelist');

scheduleJobs();
checkMissedJobs();
startMonitoring();
syncWhitelist();
