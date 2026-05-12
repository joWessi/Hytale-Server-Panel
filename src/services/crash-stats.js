// Crash-loop detection: track unplanned exits, alert on repeated crashes
const config = require('../config');
const { readJSON, writeJSON, logActivity } = require('../data/store');
const { sendDiscord } = require('./discord');

function readStats() {
  return readJSON(config.CRASH_STATS_FILE, { events: [] });
}

function recordCrash() {
  const now = Date.now();
  const stats = readStats();
  stats.events = (stats.events || []).filter(t => now - t < config.CRASH_LOOP_WINDOW_MS);
  stats.events.push(now);
  writeJSON(config.CRASH_STATS_FILE, stats);

  logActivity('system', `Crash erkannt (${stats.events.length}/${config.CRASH_LOOP_THRESHOLD} im Fenster)`);

  if (stats.events.length >= config.CRASH_LOOP_THRESHOLD) {
    sendDiscord(
      `Crash-Loop erkannt: ${stats.events.length} Crashes in den letzten ` +
      `${Math.round(config.CRASH_LOOP_WINDOW_MS / 60000)} Minuten. Auto-Restart wurde pausiert.`,
      15158332
    );
    return { loop: true, count: stats.events.length };
  }
  return { loop: false, count: stats.events.length };
}

function clearCrashStats() {
  writeJSON(config.CRASH_STATS_FILE, { events: [] });
}

function getCrashStats() {
  const stats = readStats();
  const now = Date.now();
  const recent = (stats.events || []).filter(t => now - t < config.CRASH_LOOP_WINDOW_MS);
  return {
    recentCrashes: recent.length,
    threshold: config.CRASH_LOOP_THRESHOLD,
    windowMinutes: Math.round(config.CRASH_LOOP_WINDOW_MS / 60000),
    loopActive: recent.length >= config.CRASH_LOOP_THRESHOLD,
  };
}

module.exports = { recordCrash, clearCrashStats, getCrashStats };
