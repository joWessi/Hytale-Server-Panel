// Panel settings routes: theme, server address, webhook test, activity log
const express = require('express');
const fs = require('fs');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { getSettings, saveSettings } = require('../data/settings');
const { sendDiscord } = require('../services/discord');
const { logActivity } = require('../data/store');

const router = express.Router();

// Public theme endpoint (no auth needed for login page styling)
router.get('/theme', (req, res) => {
  const settings = getSettings();
  res.json({
    panelName: settings.panelName,
    accentColor: settings.accentColor,
    cardColor: settings.cardColor,
    bgColor: settings.bgColor,
    hidePanelName: settings.hidePanelName || false,
  });
});

// Server address (authenticated, any user)
router.get('/server-address', auth, (req, res) => {
  const s = getSettings();
  const port = s.serverPort || 5520;
  res.json({ address: `${s.serverAddress}:${port}` });
});

// Full settings (settings.manage required)
router.get('/settings', auth, requirePerm('settings.manage'), (req, res) => {
  const settings = getSettings();
  // Never send Discord webhook URL to frontend
  res.json({
    ...settings,
    discordWebhook: undefined,
    discordWebhookConfigured: !!config.DISCORD_WEBHOOK_URL,
  });
});

router.post('/settings', auth, requirePerm('settings.manage'), (req, res) => {
  const settings = getSettings();
  const allowedKeys = ['serverAddress', 'serverPort', 'sessionTimeout', 'panelName',
                       'accentColor', 'cardColor', 'bgColor', 'hidePanelName'];
  allowedKeys.forEach(key => {
    if (req.body[key] !== undefined) settings[key] = req.body[key];
  });
  if (settings.serverPort) settings.serverPort = parseInt(settings.serverPort, 10) || 5520;
  if (settings.sessionTimeout) settings.sessionTimeout = parseInt(settings.sessionTimeout, 10) || 30;
  saveSettings(settings);
  logActivity(req.user.username, 'Einstellungen aktualisiert');
  res.json({ success: true });
});

// Webhook test (uses env variable, never receives URL from frontend)
router.post('/settings/test-webhook', auth, requirePerm('settings.manage'), (req, res) => {
  sendDiscord('Webhook Test erfolgreich!', 3066993);
  res.json({ success: true });
});

// Activity log
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
