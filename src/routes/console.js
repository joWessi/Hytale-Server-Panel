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

const stripAnsi = (s) => s
  .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
  .replace(/\x1b\][^\x07]*\x07/g, '');

router.get('/console', auth, requirePerm('console.read'), (req, res) => {
  res.json({ logs: readRecentLines(100) });
});

router.post('/console', auth, requirePerm('console.write'), (req, res) => {
  const cmd = sanitizeCommand(req.body?.command);
  if (!cmd) return res.status(400).json({ error: 'Ungueltiger Befehl' });
  runScript(config.SEND_CMD_SCRIPT, [cmd], 5000).catch(() => {});
  logActivity(req.user.username, `Befehl: ${cmd}`);
  res.json({ success: true });
});

function readRecentLines(n) {
  try {
    if (fs.existsSync(config.CONSOLE_LOG)) {
      const content = fs.readFileSync(config.CONSOLE_LOG, 'utf8');
      return content.split('\n').slice(-n).map(stripAnsi).filter(l => l.trim());
    }
    const dir = path.dirname(config.CONSOLE_LOG);
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.log')).sort().reverse();
      if (files.length) {
        const c = fs.readFileSync(path.join(dir, files[0]), 'utf8');
        return c.split('\n').slice(-n).map(stripAnsi).filter(l => l.trim());
      }
    }
  } catch { /* ignore */ }
  return [];
}

function parseCookies(cookieStr) {
  const cookies = {};
  (cookieStr || '').split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=');
    if (k) cookies[k] = decodeURIComponent(v.join('='));
  });
  return cookies;
}

function setupConsoleWebSocket(wss) {
  let fileWatcher = null;
  let dirWatcher = null;
  let lastSize = 0;
  let watcherActive = false;

  function broadcast(msgObj) {
    const msg = JSON.stringify(msgObj);
    wss.clients.forEach(c => {
      if (c.readyState === 1 && c.consoleAuthed) c.send(msg);
    });
  }

  function readSince(offset) {
    return new Promise((resolve) => {
      try {
        const stream = fs.createReadStream(config.CONSOLE_LOG, { start: offset, encoding: 'utf8' });
        let data = '';
        stream.on('data', (chunk) => { data += chunk; });
        stream.on('end', () => resolve(data));
        stream.on('error', () => resolve(''));
      } catch { resolve(''); }
    });
  }

  async function onChange() {
    try {
      const stat = fs.statSync(config.CONSOLE_LOG);
      // Rotated/truncated: reset and re-read tail
      if (stat.size < lastSize) lastSize = 0;
      if (stat.size <= lastSize) return;
      const data = await readSince(lastSize);
      lastSize = stat.size;
      const lines = data.split('\n').filter(l => l.trim()).map(stripAnsi);
      if (lines.length) broadcast({ type: 'lines', data: lines });
    } catch { /* file gone? wait for re-create via dirWatcher */ }
  }

  function startFileWatcher() {
    try { fileWatcher?.close(); } catch {}
    fileWatcher = null;
    if (!fs.existsSync(config.CONSOLE_LOG)) return;
    try {
      lastSize = fs.statSync(config.CONSOLE_LOG).size;
      fileWatcher = fs.watch(config.CONSOLE_LOG, { persistent: false }, (event) => {
        if (event === 'change') onChange();
        if (event === 'rename') {
          // file rotated away
          setTimeout(startFileWatcher, 500);
        }
      });
    } catch { /* ignore */ }
  }

  function ensureWatchers() {
    if (watcherActive) return;
    watcherActive = true;
    const dir = path.dirname(config.CONSOLE_LOG);
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    }
    if (fs.existsSync(dir)) {
      try {
        dirWatcher = fs.watch(dir, { persistent: false }, (event, fname) => {
          if (fname === path.basename(config.CONSOLE_LOG) && (event === 'rename' || event === 'change')) {
            startFileWatcher();
          }
        });
      } catch { /* ignore */ }
    }
    startFileWatcher();
  }

  function stopWatchersIfIdle() {
    if (!watcherActive) return;
    const stillHasClients = [...wss.clients].some(c => c.consoleAuthed && c.readyState === 1);
    if (stillHasClients) return;
    try { fileWatcher?.close(); } catch {}
    try { dirWatcher?.close(); } catch {}
    fileWatcher = null;
    dirWatcher = null;
    watcherActive = false;
    lastSize = 0;
  }

  wss.on('connection', (ws, req) => {
    ws.consoleAuthed = false;
    ws.consolePerms = [];

    try {
      const cookies = parseCookies(req.headers.cookie || '');
      const token = cookies[config.COOKIE_NAME];
      if (token) {
        const payload = jwt.verify(token, config.JWT_SECRET);
        const user = getUserByUsername(payload.username);
        if (user && user.enabled !== false && (payload.tokenVersion || 0) === (user.tokenVersion || 0)) {
          const perms = getUserPermissions(user);
          if (perms.includes('console.read')) {
            ws.consoleAuthed = true;
            ws.consolePerms = perms;
            ws.username = user.username;
          }
        }
      }
    } catch { /* auth failed */ }

    if (!ws.consoleAuthed) {
      ws.close(4001, 'Nicht authentifiziert');
      return;
    }

    ensureWatchers();

    // Send last 50 lines on connect
    ws.send(JSON.stringify({ type: 'history', data: readRecentLines(50) }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'command' && ws.consolePerms.includes('console.write')) {
          const cmd = sanitizeCommand(msg.data);
          if (cmd) {
            runScript(config.SEND_CMD_SCRIPT, [cmd], 5000).catch(() => {});
            logActivity(ws.username, `Befehl: ${cmd}`);
          }
        }
      } catch { /* ignore */ }
    });

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', stopWatchersIfIdle);
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeat);
    try { fileWatcher?.close(); } catch {}
    try { dirWatcher?.close(); } catch {}
    fileWatcher = null;
    dirWatcher = null;
    watcherActive = false;
  });
}

module.exports = router;
module.exports.setupConsoleWebSocket = setupConsoleWebSocket;
module.exports.readRecentLines = readRecentLines;
