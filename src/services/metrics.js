// System metrics + memory alerts + 24h history
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { sendDiscord } = require('./discord');
const { isServerActive, refreshPlayersIfStale, getCachedPlayers, runScript } = require('./server-control');

let memHighSince = null;
let lastMemAlertAt = 0;

function getMemoryStats() {
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    let total = 0, available = 0;
    for (const line of meminfo.split('\n')) {
      if (line.startsWith('MemTotal:')) total = parseInt(line.replace(/\D+/g, ''), 10);
      if (line.startsWith('MemAvailable:')) available = parseInt(line.replace(/\D+/g, ''), 10);
    }
    if (!total) return { memUsed: 0, memTotal: 0, memPercent: 0 };
    return {
      memUsed: Math.round((total - available) / 1024),
      memTotal: Math.round(total / 1024),
      memPercent: Math.round((1 - available / total) * 100),
    };
  } catch {
    return { memUsed: 0, memTotal: 0, memPercent: 0 };
  }
}

function getMemoryPercent() {
  return getMemoryStats().memPercent;
}

function readProcStat() {
  const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
  const nums = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = nums[3] + (nums[4] || 0);
  const total = nums.reduce((a, b) => a + b, 0);
  return { idle, total };
}

async function getCpuPercent() {
  try {
    const a = readProcStat();
    await new Promise(r => setTimeout(r, 100));
    const b = readProcStat();
    const idle = b.idle - a.idle;
    const total = b.total - a.total;
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100)));
  } catch {
    return 0;
  }
}

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

// ── Metrics History (24h ring buffer per day file) ────────────
function metricsFileFor(date) {
  const ymd = date.toISOString().substring(0, 10);
  return path.join(config.METRICS_DIR, `${ymd}.jsonl`);
}

async function recordSample() {
  try {
    const [cpu, mem, running] = await Promise.all([
      getCpuPercent(),
      Promise.resolve(getMemoryStats()),
      isServerActive(),
    ]);
    let players = 0;
    if (running) {
      await refreshPlayersIfStale();
      players = getCachedPlayers();
    }
    const sample = { t: Date.now(), cpu, mem: mem.memPercent, players, running: running ? 1 : 0 };
    fs.appendFileSync(metricsFileFor(new Date()), JSON.stringify(sample) + '\n');
    pruneOldMetrics();
  } catch { /* ignore */ }
}

function pruneOldMetrics() {
  try {
    const cutoff = Date.now() - config.METRICS_HISTORY_HOURS * 3600 * 1000 - 24 * 3600 * 1000;
    const cutoffDate = new Date(cutoff).toISOString().substring(0, 10);
    for (const f of fs.readdirSync(config.METRICS_DIR)) {
      if (!f.endsWith('.jsonl')) continue;
      const day = f.replace('.jsonl', '');
      if (day < cutoffDate) {
        try { fs.unlinkSync(path.join(config.METRICS_DIR, f)); } catch {}
      }
    }
  } catch { /* ignore */ }
}

function getMetricsHistory(hours = config.METRICS_HISTORY_HOURS) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  const samples = [];
  try {
    const files = fs.readdirSync(config.METRICS_DIR).filter(f => f.endsWith('.jsonl')).sort();
    for (const f of files) {
      const content = fs.readFileSync(path.join(config.METRICS_DIR, f), 'utf8');
      for (const line of content.split('\n')) {
        if (!line) continue;
        try {
          const s = JSON.parse(line);
          if (s.t >= cutoff) samples.push(s);
        } catch { /* skip bad line */ }
      }
    }
  } catch { /* ignore */ }
  return samples;
}

let metricsTimer = null;
let alertTimer = null;

function startMonitoring() {
  if (alertTimer) clearInterval(alertTimer);
  alertTimer = setInterval(() => checkMemoryAlert().catch(() => {}), config.MEM_ALERT_INTERVAL_MS);

  if (metricsTimer) clearInterval(metricsTimer);
  metricsTimer = setInterval(() => recordSample().catch(() => {}), config.METRICS_SAMPLE_MS);

  recordSample().catch(() => {});
}

module.exports = {
  getMemoryStats, getMemoryPercent, getCpuPercent,
  checkMemoryAlert, startMonitoring,
  recordSample, getMetricsHistory,
};
