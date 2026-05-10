// Console routes: read logs, send commands, WebSocket live streaming
const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { sanitizeCommand } = require('../middleware/security');
const { runScript } = require('../services/server-control');
const { getUserByUsername, getUserPermissions } = require('../data/users');
const { logActivity } = require('../data/store');

const router = express.Router();

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');

router.get('/console', auth, requirePerm('console.read'), (req, res) => {
  const logFile = config.CONSOLE_LOG;
  const logsDir = path.dirname(logFile);

  try {
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n').slice(-200).map(stripAnsi);
      return res.json({ logs: lines.slice(-100) });
    }
    if (fs.existsSync(logsDir)) {
      const logFiles = fs.readdirSync(logsDir).filter(f => f.endsWith('.log')).sort().reverse();
      if (logFiles.length > 0) {
        const content = fs.readFileSync(path.join(logsDir, logFiles[0]), 'utf8');
        const lines = content.split('\n').slice(-100).map(stripAnsi);
        return res.json({ logs: lines });
      }
    }
  } catch { /* ignore read errors */ }
  res.json({ logs: [] });
});

router.post('/console', auth, requirePerm('console.write'), (req, res) => {
  const cmd = sanitizeCommand(req.body.command);
  if (!cmd) {
    return res.status(400).json({ error: 'Ungueltiger Befehl' });
  }
  runScript(config.SEND_CMD_SCRIPT, [cmd], 5000).catch(() => {});
  logActivity(req.user.username, `Befehl: ${cmd}`);
  res.json({ success: true });
});

/**
 * Attach WebSocket server for live console streaming.
 * Call this after creating the HTTP server.
 */
function setupConsoleWebSocket(wss) {
  let fileWatcher = null;
  let lastSize = 0;

  // Start watching console.log when first client connects
  function ensureWatcher() {
    if (fileWatcher) return;
    try {
      if (fs.existsSync(config.CONSOLE_LOG)) {
        lastSize = fs.statSync(config.CONSOLE_LOG).size;
      }
      const dir = path.dirname(config.CONSOLE_LOG);
      if (!fs.existsSync(dir)) return;

      fileWatcher = fs.watch(config.CONSOLE_LOG, { persistent: false }, (eventType) => {
        if (eventType !== 'change') return;
        try {
          const stat = fs.statSync(config.CONSOLE_LOG);
          if (stat.size < lastSize) {
            // File was truncated/rotated, reset
            lastSize = 0;
          }
          if (stat.size <= lastSize) return;

          const stream = fs.createReadStream(config.CONSOLE_LOG, { start: lastSize, encoding: 'utf8' });
          let data = '';
          stream.on('data', chunk => { data += chunk; });
          stream.on('end', () => {
            lastSize = stat.size;
            const lines = data.split('\n').filter(l => l.trim());
            if (lines.length === 0) return;
            const cleaned = lines.map(stripAnsi);
            const msg = JSON.stringify({ type: 'lines', data: cleaned });
            wss.clients.forEach(client => {
              if (client.readyState === 1 && client.consoleAuthed) {
                client.send(msg);
              }
            });
          });
        } catch { /* ignore watch errors */ }
      });
    } catch { /* ignore watcher setup errors */ }
  }

  wss.on('connection', (ws, req) => {
    ws.consoleAuthed = false;
    ws.consolePerms = [];

    // Authenticate via cookie from upgrade request
    try {
      const cookies = parseCookies(req.headers.cookie || '');
      const token = cookies[config.COOKIE_NAME];
      if (token) {
        const payload = jwt.verify(token, config.JWT_SECRET);
        const user = getUserByUsername(payload.username);
        if (user && user.enabled !== false) {
          const perms = getUserPermissions(user);
          if (perms.includes('console.read')) {
            ws.consoleAuthed = true;
            ws.consolePerms = perms;
          }
        }
      }
    } catch { /* auth failed */ }

    if (!ws.consoleAuthed) {
      ws.close(4001, 'Nicht authentifiziert');
      return;
    }

    ensureWatcher();

    // Send last 50 lines on connect
    try {
      if (fs.existsSync(config.CONSOLE_LOG)) {
        const content = fs.readFileSync(config.CONSOLE_LOG, 'utf8');
        const lines = content.split('\n').slice(-50).map(stripAnsi).filter(l => l.trim());
        ws.send(JSON.stringify({ type: 'history', data: lines }));
      }
    } catch { /* ignore */ }

    // Handle incoming commands
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'command' && ws.consolePerms.includes('console.write')) {
          const cmd = sanitizeCommand(msg.data);
          if (cmd) {
            runScript(config.SEND_CMD_SCRIPT, [cmd], 5000).catch(() => {});
          }
        }
      } catch { /* ignore malformed messages */ }
    });

    // Heartbeat
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  });

  // Heartbeat interval: detect stale connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeat);
    if (fileWatcher) { fileWatcher.close(); fileWatcher = null; }
  });
}

function parseCookies(cookieStr) {
  const cookies = {};
  cookieStr.split(';').forEach(pair => {
    const [key, ...val] = pair.trim().split('=');
    if (key) cookies[key] = decodeURIComponent(val.join('='));
  });
  return cookies;
}

module.exports = router;
module.exports.setupConsoleWebSocket = setupConsoleWebSocket;
