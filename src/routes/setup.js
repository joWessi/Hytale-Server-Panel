// Hytale server install / update via the official downloader CLI.
// All heavy lifting runs in /usr/local/bin/hytale-setup.sh which we invoke
// via sudo; stdout is streamed back to the browser through a WebSocket.
const express = require('express');
const fs = require('fs');
const { spawn } = require('child_process');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { logActivity } = require('../data/store');
const sc = require('../services/server-control');

const router = express.Router();
const SETUP_SCRIPT = '/usr/local/bin/hytale-setup.sh';
const INSTALLED_VERSION_FILE = '/home/hytale/.hytale-installed-version';

// One concurrent run at a time, tracked here so HTTP status calls can report it
let currentRun = null;

function isInstalled() {
  return fs.existsSync(config.SERVER_JAR);
}

function readInstalledVersion() {
  try { return fs.readFileSync(INSTALLED_VERSION_FILE, 'utf8').trim(); }
  catch { return ''; }
}

router.get('/setup/status', auth, (req, res) => {
  res.json({
    installed: isInstalled(),
    installedVersion: readInstalledVersion(),
    running: !!currentRun,
    downloaderAvailable: fs.existsSync(SETUP_SCRIPT),
  });
});

// Synchronous version check (no OAuth needed if credentials already cached)
router.post('/setup/check', auth, requirePerm('server.control'), (req, res) => {
  if (currentRun) return res.status(409).json({ error: 'Setup läuft bereits' });
  const patchline = req.body?.patchline === 'pre-release' ? 'pre-release' : 'release';
  const child = spawn('sudo', ['-n', SETUP_SCRIPT, 'check', patchline]);
  let out = '';
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.stderr.on('data', (d) => { out += d.toString(); });
  child.on('close', () => {
    const events = parseJsonLines(out);
    const version = events.find(e => e.type === 'version')?.version || '';
    const errors = events.filter(e => e.type === 'error').map(e => e.msg);
    res.json({ version, errors, events });
  });
});

// Clear stored OAuth credentials (force re-auth on next run)
router.post('/setup/auth-clear', auth, requirePerm('server.control'), (req, res) => {
  if (currentRun) return res.status(409).json({ error: 'Setup läuft bereits' });
  const child = spawn('sudo', ['-n', SETUP_SCRIPT, 'auth-clear']);
  child.on('close', () => res.json({ success: true }));
});

function parseJsonLines(text) {
  return text.split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return { type: 'info', msg: l }; } });
}

// WebSocket setup runs the long-lived install/update command and streams events.
// Frontend opens /ws/setup with action=install|update query param.
function setupSetupWebSocket(wss) {
  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const action = url.searchParams.get('action');
    const patchline = url.searchParams.get('patchline') === 'pre-release' ? 'pre-release' : 'release';

    // Authenticate via cookie
    const { authedUser } = require('../middleware/auth-ws');
    const user = authedUser(req);
    if (!user || !user.permissions.includes('server.control') && user.role !== 'admin') {
      ws.send(JSON.stringify({ type: 'error', msg: 'Nicht authentifiziert' }));
      ws.close(4001);
      return;
    }

    if (action !== 'install' && action !== 'update') {
      ws.send(JSON.stringify({ type: 'error', msg: 'Ungültige Aktion' }));
      ws.close(4002);
      return;
    }

    if (currentRun) {
      ws.send(JSON.stringify({ type: 'error', msg: 'Setup läuft bereits' }));
      ws.close(4003);
      return;
    }

    const isUpdate = action === 'update';
    if (isUpdate && (await sc.isServerActive())) {
      ws.send(JSON.stringify({ type: 'info', msg: 'Stoppe Server vor Update...' }));
      const { markPlannedRestart } = require('../services/planned-restart');
      markPlannedRestart();
      await sc.systemctl('stop').catch(() => {});
      for (let i = 0; i < 30; i++) {
        if (!(await sc.isServerActive())) break;
        await sc.delay(1000);
      }
    }

    const child = spawn('sudo', ['-n', SETUP_SCRIPT, 'install', patchline]);
    currentRun = child;
    logActivity(user.username, isUpdate ? 'Server-Update gestartet' : 'Server-Installation gestartet');

    let buffer = '';
    const flushLine = (line) => {
      if (!line.trim()) return;
      try {
        const obj = JSON.parse(line);
        ws.send(JSON.stringify(obj));
      } catch {
        ws.send(JSON.stringify({ type: 'info', msg: line }));
      }
    };

    child.stdout.on('data', (data) => {
      buffer += data.toString();
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        flushLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    });
    child.stderr.on('data', (data) => {
      ws.send(JSON.stringify({ type: 'info', msg: data.toString().trim() }));
    });

    child.on('close', (code) => {
      if (buffer.trim()) flushLine(buffer);
      ws.send(JSON.stringify({ type: 'finished', exitCode: code, success: code === 0 }));
      currentRun = null;
      if (code === 0) {
        logActivity('system', `${isUpdate ? 'Update' : 'Installation'} abgeschlossen`);
      } else {
        logActivity('system', `${isUpdate ? 'Update' : 'Installation'} fehlgeschlagen (exit ${code})`);
      }
      try { ws.close(); } catch {}
    });

    ws.on('close', () => {
      // Don't kill the child on disconnect — let install finish, panel can
      // reconnect to /api/setup/status to see if it's still running.
    });
  });
}

module.exports = router;
module.exports.setupSetupWebSocket = setupSetupWebSocket;
