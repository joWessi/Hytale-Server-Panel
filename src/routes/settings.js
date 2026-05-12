// Panel settings routes
const express = require('express');
const fs = require('fs');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { getSettings, saveSettings } = require('../data/settings');
const { sendDiscord } = require('../services/discord');
const { applyRetention } = require('../services/backup');
const { logActivity } = require('../data/store');

const router = express.Router();

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Public theme endpoint (login page)
router.get('/theme', (req, res) => {
  const s = getSettings();
  res.json({
    panelName: s.panelName,
    accentColor: s.accentColor,
    cardColor: s.cardColor,
    bgColor: s.bgColor,
    hidePanelName: !!s.hidePanelName,
  });
});

// Server address (any authenticated user)
router.get('/server-address', auth, (req, res) => {
  const s = getSettings();
  res.json({ address: `${s.serverAddress}:${s.serverPort || 5520}` });
});

// Full settings (admin)
router.get('/settings', auth, requirePerm('settings.manage'), (req, res) => {
  const s = getSettings();
  res.json({ ...s, discordWebhookConfigured: !!config.DISCORD_WEBHOOK_URL });
});

router.post('/settings', auth, requirePerm('settings.manage'), (req, res) => {
  const s = getSettings();
  const b = req.body || {};

  if (typeof b.panelName === 'string') s.panelName = b.panelName.slice(0, 50);
  if (typeof b.hidePanelName === 'boolean') s.hidePanelName = b.hidePanelName;
  if (typeof b.serverAddress === 'string') s.serverAddress = b.serverAddress.slice(0, 100);
  if (b.serverPort !== undefined) {
    const port = parseInt(b.serverPort, 10);
    if (port >= 1 && port <= 65535) s.serverPort = port;
  }
  if (b.sessionTimeout !== undefined) {
    const t = parseInt(b.sessionTimeout, 10);
    if (t >= 0 && t <= 1440) s.sessionTimeout = t;
  }
  if (HEX_RE.test(b.accentColor)) s.accentColor = b.accentColor;
  if (HEX_RE.test(b.cardColor)) s.cardColor = b.cardColor;
  if (HEX_RE.test(b.bgColor)) s.bgColor = b.bgColor;
  if (b.maxBackups !== undefined) {
    const n = parseInt(b.maxBackups, 10);
    if (n >= 1 && n <= 100) s.maxBackups = n;
  }
  if (b.backupRetention === 'fifo' || b.backupRetention === 'gfs') {
    s.backupRetention = b.backupRetention;
  }

  saveSettings(s);
  applyRetention();
  logActivity(req.user.username, 'Einstellungen aktualisiert');
  res.json({ success: true });
});

router.post('/settings/test-webhook', auth, requirePerm('settings.manage'), (req, res) => {
  sendDiscord('Webhook Test erfolgreich!', 3066993);
  res.json({ success: true });
});

router.get('/activity-log', auth, requirePerm('settings.manage'), (req, res) => {
  if (!fs.existsSync(config.ACTIVITY_LOG)) return res.json({ log: '' });
  res.json({ log: fs.readFileSync(config.ACTIVITY_LOG, 'utf8') });
});

router.get('/activity-log/download', auth, requirePerm('settings.manage'), (req, res) => {
  if (!fs.existsSync(config.ACTIVITY_LOG)) {
    res.setHeader('Content-Type', 'text/plain');
    return res.send('Keine Aktivitaeten');
  }
  res.download(config.ACTIVITY_LOG, 'activity-log.txt');
});

module.exports = router;
