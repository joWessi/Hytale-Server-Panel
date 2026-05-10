// Server control routes: start, stop, restart, status
const express = require('express');
const fs = require('fs');
const config = require('../config');
const { auth } = require('../middleware/auth');
const { requirePerm } = require('../middleware/auth');
const { logActivity } = require('../data/store');
const { sendDiscord } = require('../services/discord');
const sc = require('../services/server-control');

const router = express.Router();

let serverActionInProgress = false;

router.get('/status', auth, async (req, res) => {
  try {
    const running = await sc.isServerActive();
    let uptime = 0, players = 0;
    if (running) {
      uptime = await sc.getServerUptimeSeconds();
      await sc.refreshPlayersIfStale();
      players = sc.getCachedPlayers();
    }
    res.json({ running, uptime, players });
  } catch {
    res.json({ running: false, uptime: 0, players: 0 });
  }
});

router.post('/server/:action', auth, requirePerm('server.control'), async (req, res) => {
  const { action } = req.params;

  if (serverActionInProgress) {
    return res.status(409).json({ success: false, message: 'Aktion laeuft bereits' });
  }

  serverActionInProgress = true;
  try {
    if (action === 'start') {
      const alreadyRunning = await sc.isServerActive();
      if (alreadyRunning) return res.json({ success: false, message: 'Server laeuft bereits' });

      const jarExists = fs.existsSync(config.SERVER_JAR);
      if (!jarExists) {
        sendDiscord('Server konnte nicht gestartet werden - keine .jar Datei gefunden!', 15158332);
        return res.json({ success: false, message: 'Server JAR nicht gefunden' });
      }

      await sc.systemctl('start');
      await sc.delay(2000);
      if (!(await sc.isServerActive())) {
        sendDiscord('Serverstart fehlgeschlagen', 15158332);
        return res.json({ success: false, message: 'Start fehlgeschlagen' });
      }
      sendDiscord('Server wurde gestartet', 3066993);
      logActivity(req.user.username, 'Server gestartet');
      res.json({ success: true });

    } else if (action === 'stop') {
      if (!(await sc.isServerActive())) {
        return res.json({ success: false, message: 'Server laeuft nicht' });
      }
      sendDiscord('Server wird gestoppt...', 15105570);
      logActivity(req.user.username, 'Server gestoppt');
      fs.writeFileSync('/tmp/hytale-planned-restart', '');
      await sc.runScript(config.STOP_SCRIPT, [], 20000).catch(() => {});
      await sc.systemctl('stop').catch(() => {});

      // Wait for clean shutdown
      for (let i = 0; i < 30; i++) {
        if (!(await sc.isServerActive())) break;
        await sc.delay(1000);
      }
      res.json({ success: true });

    } else if (action === 'restart') {
      sendDiscord('Server wird neugestartet...', 15105570);
      logActivity(req.user.username, 'Server neugestartet');

      if (await sc.isServerActive()) {
        fs.writeFileSync('/tmp/hytale-planned-restart', '');
        await sc.runScript(config.STOP_SCRIPT, [], 20000).catch(() => {});
        await sc.systemctl('stop').catch(() => {});
      }

      await sc.systemctl('start').catch(() => {});
      await sc.delay(2000);
      if (await sc.isServerActive()) {
        sendDiscord('Server wurde neugestartet', 3066993);
      } else {
        sendDiscord('Neustart fehlgeschlagen', 15158332);
      }
      res.json({ success: true });

    } else {
      res.status(400).json({ success: false, message: 'Unbekannte Aktion' });
    }
  } finally {
    serverActionInProgress = false;
  }
});

module.exports = router;
