// Panel settings routes
const express = require('express');
const fs = require('fs');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { getSettings, saveSettings } = require('../data/settings');
const { sendDiscord, isWebhookConfigured } = require('../services/discord');
const { applyRetention } = require('../services/backup');
const { logActivity } = require('../data/store');

const router = express.Router();

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DISCORD_WEBHOOK_RE = /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/;

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

// Full settings (admin) — webhook URL is never sent to the frontend.
router.get('/settings', auth, requirePerm('settings.manage'), (req, res) => {
  const s = getSettings();
  const { discordWebhook, ...safe } = s;
  res.json({
    ...safe,
    discordWebhookConfigured: isWebhookConfigured(),
    discordWebhookSource: s.discordWebhook
      ? 'settings'
      : (config.DISCORD_WEBHOOK_URL ? 'env' : 'none'),
  });
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
  // Webhook: empty string clears it, otherwise must match Discord URL pattern.
  // Keep current value if field is omitted entirely (frontend never sees it
  // and doesn't have to round-trip it on every save).
  if (typeof b.discordWebhook === 'string') {
    const trimmed = b.discordWebhook.trim();
    if (trimmed === '') {
      delete s.discordWebhook;
    } else if (DISCORD_WEBHOOK_RE.test(trimmed)) {
      s.discordWebhook = trimmed;
    } else {
      return res.status(400).json({ error: 'Ungültige Discord-Webhook-URL' });
    }
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
    return res.send('Keine Aktivitäten');
  }
  res.download(config.ACTIVITY_LOG, 'activity-log.txt');
});

module.exports = router;
