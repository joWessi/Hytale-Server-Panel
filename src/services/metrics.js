// System metrics and memory alert monitoring
const fs = require('fs');
const config = require('../config');
const { sendDiscord } = require('./discord');
const { isServerActive, refreshPlayersIfStale, getCachedPlayers, runScript } = require('./server-control');

let memHighSince = null;
let lastMemAlertAt = 0;

/**
 * Read memory usage from /proc/meminfo (no shell exec needed).
 */
function getMemoryPercent() {
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    let total = 0, available = 0;
    for (const line of meminfo.split('\n')) {
      if (line.startsWith('MemTotal:')) total = parseInt(line.replace(/\D+/g, ''), 10);
      if (line.startsWith('MemAvailable:')) available = parseInt(line.replace(/\D+/g, ''), 10);
    }
    if (!total) return 0;
    return Math.round((1 - available / total) * 100);
  } catch {
    return 0;
  }
}

/**
 * Check if RAM has been above threshold for extended period and send alerts.
 */
async function checkMemoryAlert() {
  const percent = getMemoryPercent();
  const now = Date.now();

  if (percent >= config.MEM_ALERT_THRESHOLD) {
    if (!memHighSince) memHighSince = now;
    if (now - memHighSince >= config.MEM_ALERT_INTERVAL_MS &&
        now - lastMemAlertAt >= config.MEM_ALERT_INTERVAL_MS) {
      const msg = `Warnung: RAM-Auslastung seit 5 Min >90% (aktuell ${percent}%).`;
      sendDiscord(msg, 15105570);
      try {
        if (await isServerActive()) {
          await refreshPlayersIfStale();
          if (getCachedPlayers() > 0) {
            runScript(config.SEND_CMD_SCRIPT, [`say ${msg}`], 5000).catch(() => {});
          }
        }
      } catch { /* ignore */ }
      lastMemAlertAt = now;
    }
  } else {
    memHighSince = null;
    lastMemAlertAt = 0;
  }
}

/**
 * Start periodic memory monitoring.
 */
function startMonitoring() {
  setInterval(() => checkMemoryAlert().catch(() => {}), config.MEM_ALERT_INTERVAL_MS);
}

module.exports = { getMemoryPercent, checkMemoryAlert, startMonitoring };
