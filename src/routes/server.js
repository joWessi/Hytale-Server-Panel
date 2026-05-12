// Server control routes: start, stop, restart, status
const express = require('express');
const fs = require('fs');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { logActivity } = require('../data/store');
const { sendDiscord } = require('../services/discord');
const sc = require('../services/server-control');
const { markPlannedRestart } = require('../services/planned-restart');

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
      return res.json({ success: ok });
    }
  } finally {
    serverActionInProgress = false;
  }
});

module.exports = router;
