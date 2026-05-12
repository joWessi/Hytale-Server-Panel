// Discord webhook notifications
// URL precedence: settings.discordWebhook (from UI) > DISCORD_WEBHOOK env var
const https = require('https');
const config = require('../config');
const { getSettings } = require('../data/settings');

function getWebhookUrl() {
  const s = getSettings();
  return s.discordWebhook || config.DISCORD_WEBHOOK_URL || '';
}

function isWebhookConfigured() {
  return !!getWebhookUrl();
}

function sendDiscord(message, color = 3066993) {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return;

  let url;
  try { url = new URL(webhookUrl); }
  catch { return; }
  if (url.protocol !== 'https:') return;

  const settings = getSettings();
  const payload = JSON.stringify({
    embeds: [{
      title: settings.panelName || 'Hytale Panel',
      description: message,
      color,
      timestamp: new Date().toISOString(),
    }],
  });

  try {
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 5000,
    });
    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
    req.write(payload);
    req.end();
  } catch { /* ignore */ }
}

module.exports = { sendDiscord, isWebhookConfigured };
