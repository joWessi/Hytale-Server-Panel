// Consolidated dashboard endpoint - one call instead of 6
const express = require('express');
const { auth } = require('../middleware/auth');
const { getSettings, getScheduler } = require('../data/settings');
const { getUsers } = require('../data/users');
const { isWhitelisted } = require('../services/whitelist');
const { getCpuPercent, getMemoryStats, getMetricsHistory } = require('../services/metrics');
const { getDisk } = require('./system');
const sc = require('../services/server-control');
const { getCrashStats } = require('../services/crash-stats');

const router = express.Router();

router.get('/dashboard', auth, async (req, res) => {
  try {
    const [cpu, disk, running] = await Promise.all([
      getCpuPercent(),
      getDisk(),
      sc.isServerActive(),
    ]);

    let uptime = 0;
    let players = 0;
    if (running) {
      uptime = await sc.getServerUptimeSeconds();
      await sc.refreshPlayersIfStale();
      players = sc.getCachedPlayers();
    } else {
      sc.invalidatePlayerCache();
    }

    const settings = getSettings();
    const scheduler = getScheduler();
    const me = getUsers().find(u => u.username === req.user.username);
    const myWl = me?.uuid ? isWhitelisted(me.uuid) : false;

    res.json({
      server: { running, uptime, players },
      system: { cpu, ...getMemoryStats() },
      disk,
      address: `${settings.serverAddress}:${settings.serverPort || 5520}`,
      scheduler: {
        autoRestart: scheduler.autoRestart,
        restartTime: scheduler.restartTime,
        lastRestart: scheduler.lastRestart,
        autoBackup: scheduler.autoBackup,
        backupTime: scheduler.backupTime,
        lastBackup: scheduler.lastBackup,
      },
      whitelist: {
        uuid: me?.uuid || null,
        enabled: me?.enabled !== false,
        whitelisted: myWl,
      },
      crashStats: getCrashStats(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/dashboard/metrics', auth, (req, res) => {
  const hours = Math.max(1, Math.min(168, parseInt(req.query.hours, 10) || 24));
  res.json({ samples: getMetricsHistory(hours), hours });
});

module.exports = router;
