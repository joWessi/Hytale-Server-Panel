// Server control routes: start, stop, restart, status
const express = require('express');
const fs = require('fs');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { logActivity } = require('../data/store');
const { sendDiscord } = require('../services/discord');
const sc = require('../services/server-control');
const { markPlannedRestart } = require('../services/planned-restart');
const { getSettings, saveSettings } = require('../data/settings');

// Re-issue `whitelist enable` after every boot. Hytale's whitelist module in
// the current alpha does not persist enabled-state across restarts (the JSON's
// `enabled:true` is also ignored at startup), so we have to push the command
// each time the server is up. Idempotent + cheap.
function initWhitelistOnce() {
  setTimeout(async () => {
    try {
      await sc.runScript(config.SEND_CMD_SCRIPT, ['whitelist enable'], 5000);
    } catch { /* ignore */ }
  }, 10000);
}

const router = express.Router();

let serverActionInProgress = false;

async function waitForState(running, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await sc.isServerActive()) === running) return true;
    await sc.delay(1000);
  }
  return false;
}

router.get('/status', auth, async (req, res) => {
  try {
    const running = await sc.isServerActive();
    let uptime = 0, players = 0;
    if (running) {
      uptime = await sc.getServerUptimeSeconds();
      await sc.refreshPlayersIfStale();
      players = sc.getCachedPlayers();
    } else {
      sc.invalidatePlayerCache();
    }
    res.json({ running, uptime, players });
  } catch {
    res.json({ running: false, uptime: 0, players: 0 });
  }
});

router.post('/server/:action', auth, requirePerm('server.control'), async (req, res) => {
  const { action } = req.params;
  if (!['start', 'stop', 'restart'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Unbekannte Aktion' });
  }

  if (serverActionInProgress) {
    return res.status(409).json({ success: false, message: 'Aktion läuft bereits' });
  }
  serverActionInProgress = true;

  try {
    if (action === 'start') {
      if (await sc.isServerActive()) {
        return res.json({ success: false, message: 'Server läuft bereits' });
      }
      if (!fs.existsSync(config.SERVER_JAR)) {
        sendDiscord('Server konnte nicht gestartet werden - keine .jar Datei gefunden!', 15158332);
        return res.json({ success: false, message: 'Server JAR nicht gefunden' });
      }
      await sc.systemctl('start');
      const ok = await waitForState(true, 15000);
      if (!ok) {
        sendDiscord('Serverstart fehlgeschlagen', 15158332);
        return res.json({ success: false, message: 'Start fehlgeschlagen' });
      }
      sendDiscord('Server wurde gestartet', 3066993);
      logActivity(req.user.username, 'Server gestartet');
      initWhitelistOnce();
      return res.json({ success: true });
    }

    if (action === 'stop') {
      if (!(await sc.isServerActive())) {
        return res.json({ success: false, message: 'Server läuft nicht' });
      }
      sendDiscord('Server wird gestoppt...', 15105570);
      logActivity(req.user.username, 'Server gestoppt');
      markPlannedRestart();
      // systemctl stop -> ExecStop runs hytale-stop.sh (countdown + graceful save)
      await sc.systemctl('stop').catch(() => {});
      await waitForState(false, 30000);
      return res.json({ success: true });
    }

    if (action === 'restart') {
      sendDiscord('Server wird neugestartet...', 15105570);
      logActivity(req.user.username, 'Server neugestartet');
      markPlannedRestart();
      await sc.systemctl('restart').catch(() => {});
      const ok = await waitForState(true, 60000);
      sendDiscord(ok ? 'Server wurde neugestartet' : 'Neustart fehlgeschlagen', ok ? 3066993 : 15158332);
      if (ok) initWhitelistOnce();
      return res.json({ success: ok });
    }
  } finally {
    serverActionInProgress = false;
  }
});

// ── Hytale server authentication status / re-login ──────────────
const path = require('path');
const AUTH_FILE = path.join(config.SERVER_DIR, 'auth.enc');

function parseAuthStatusFromLog() {
  // Look at the last ~150 console lines for the most recent auth-related
  // status markers. Cheap and robust — no FIFO round-trip needed for the
  // common case (server emits "Authentication successful! Mode: X" on
  // login, plus periodic "Token refresh scheduled" lines).
  try {
    if (!fs.existsSync(config.CONSOLE_LOG)) return null;
    const content = fs.readFileSync(config.CONSOLE_LOG, 'utf8');
    const lines = content.split('\n').slice(-300);
    const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
    let mode = null, profile = null, success = false, failed = false, needsAuth = false;
    for (const raw of lines) {
      const l = stripAnsi(raw);
      let m;
      if ((m = l.match(/Authentication successful!\s*Mode:\s*(\S+)/))) { success = true; mode = m[1]; }
      if ((m = l.match(/Profile:\s*([^\s(]+)\s*\(([0-9a-f-]+)\)/i))) { profile = { name: m[1], uuid: m[2] }; }
      if (/No server tokens configured/i.test(l)) needsAuth = true;
      if (/Authentication failed/i.test(l)) failed = true;
      if (/auth logout|Credentials cleared/i.test(l)) { success = false; needsAuth = true; }
    }
    return { success, mode, profile, failed, needsAuth };
  } catch {
    return null;
  }
}

router.get('/server/auth-status', auth, async (req, res) => {
  const running = await sc.isServerActive();
  const authFileExists = fs.existsSync(AUTH_FILE);
  const fromLog = parseAuthStatusFromLog();

  let state;
  if (!running) {
    state = authFileExists ? 'persisted_offline' : 'not_authenticated';
  } else if (fromLog?.needsAuth && !fromLog?.success) {
    state = 'not_authenticated';
  } else if (fromLog?.success) {
    state = 'authenticated';
  } else if (authFileExists) {
    state = 'persisted';
  } else {
    state = 'unknown';
  }

  res.json({
    state,
    running,
    persisted: authFileExists,
    mode: fromLog?.mode || null,
    profile: fromLog?.profile || null,
  });
});

router.post('/server/auth-relogin', auth, requirePerm('server.control'), async (req, res) => {
  if (!(await sc.isServerActive())) {
    return res.status(400).json({ error: 'Server muss laufen für Re-Authentifizierung' });
  }
  try {
    // `auth login device` triggers the device-code flow; the panel's console
    // auto-detect picks up the URL+code and shows the modal. Use the proper
    // cmd-FIFO via the existing send-script so permissions are correct.
    await sc.runScript(config.SEND_CMD_SCRIPT, ['auth login device'], 5000);
    logActivity(req.user.username, 'Server Re-Authentifizierung gestartet');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
