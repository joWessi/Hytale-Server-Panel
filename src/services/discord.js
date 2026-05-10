// Discord webhook notifications
const https = require('https');
const config = require('../config');
const { getSettings } = require('../data/settings');

/**
 * Send an embed message to the configured Discord webhook.
 * Uses DISCORD_WEBHOOK_URL from environment (never exposed to frontend).
 */
function sendDiscord(message, color = 3066993) {
  const webhookUrl = config.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

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
    const url = new URL(webhookUrl);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    });
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch { /* silently ignore webhook errors */ }
}

module.exports = { sendDiscord };
