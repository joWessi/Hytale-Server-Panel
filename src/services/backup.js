// Backup creation + retention strategies
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const config = require('../config');
const { getSettings } = require('../data/settings');
const { runScript, delay } = require('./server-control');

const BACKUP_CONFIG_FILES = ['config.json', 'permissions.json', 'bans.json'];

async function createBackup(isServerRunning) {
  if (!fs.existsSync(config.SERVER_DIR) || fs.readdirSync(config.SERVER_DIR).length === 0) {
    return { name: '', success: false, message: 'Server-Ordner leer' };
  }

  if (isServerRunning) {
    try { await runScript(config.SEND_SAVE_SCRIPT, [], 5000); } catch { /* ignore */ }
    await delay(10000);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = isServerRunning ? 'backup' : 'offline-backup';
  const name = `${prefix}-${timestamp}.zip`;
  const archivePath = path.join(config.BACKUPS_DIR, name);
  const universeDir = path.join(config.SERVER_DIR, 'universe');
  const tempDir = `/tmp/hytale-backup-${Date.now()}`;

  return new Promise((resolve) => {
    const output = fs.createWriteStream(archivePath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(output);

    if (isServerRunning && fs.existsSync(universeDir)) {
      try {
        fs.mkdirSync(tempDir, { recursive: true });
        fs.cpSync(universeDir, path.join(tempDir, 'universe'), { recursive: true });
        BACKUP_CONFIG_FILES.forEach(f => {
          const src = path.join(config.SERVER_DIR, f);
          if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tempDir, f));
        });
        addToArchive(archive, tempDir);
      } catch {
        addToArchiveDirect(archive, universeDir);
      }
    } else {
      addToArchiveDirect(archive, universeDir);
    }

    archive.on('error', () => {
      cleanupTemp(tempDir);
      resolve({ name, success: false, message: 'Archivierungsfehler' });
    });

    output.on('close', () => {
      cleanupTemp(tempDir);
      applyRetention();
      resolve({ name, success: true });
    });

    archive.finalize();
  });
}

function addToArchive(archive, tempDir) {
  const universeTemp = path.join(tempDir, 'universe');
  if (fs.existsSync(universeTemp)) archive.directory(universeTemp, 'universe');
  BACKUP_CONFIG_FILES.forEach(f => {
    const fp = path.join(tempDir, f);
    if (fs.existsSync(fp)) archive.file(fp, { name: f });
  });
}

function addToArchiveDirect(archive, universeDir) {
  if (fs.existsSync(universeDir)) archive.directory(universeDir, 'universe');
  BACKUP_CONFIG_FILES.forEach(f => {
    const fp = path.join(config.SERVER_DIR, f);
    if (fs.existsSync(fp)) archive.file(fp, { name: f });
  });
}

function cleanupTemp(tempDir) {
  try {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

function listBackups() {
  if (!fs.existsSync(config.BACKUPS_DIR)) return [];
  return fs.readdirSync(config.BACKUPS_DIR)
    .filter(f => f.endsWith('.zip'))
    .map(name => {
      const stat = fs.statSync(path.join(config.BACKUPS_DIR, name));
      return { name, size: stat.size, mtime: stat.mtime.getTime() };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function applyRetention() {
  const settings = getSettings();
  if (settings.backupRetention === 'gfs') {
    applyGFSRetention();
  } else {
    applyFIFORetention(parseInt(settings.maxBackups, 10) || config.DEFAULT_MAX_BACKUPS);
  }
}

function applyFIFORetention(maxBackups) {
  const backups = listBackups();
  for (const old of backups.slice(maxBackups)) {
    try { fs.unlinkSync(path.join(config.BACKUPS_DIR, old.name)); } catch {}
  }
}

// GFS: keep last 7 daily, last 4 weekly (Sunday), last 6 monthly (1st of month)
function applyGFSRetention() {
  const backups = listBackups();
  const keep = new Set();

  // Bucket each backup
  const byDay = new Map();
  const byWeek = new Map();
  const byMonth = new Map();

  for (const b of backups) {
    const d = new Date(b.mtime);
    const dayKey = d.toISOString().substring(0, 10);
    const weekKey = `${d.getUTCFullYear()}-W${getWeekNumber(d)}`;
    const monthKey = d.toISOString().substring(0, 7);

    if (!byDay.has(dayKey)) byDay.set(dayKey, b.name);
    if (!byWeek.has(weekKey)) byWeek.set(weekKey, b.name);
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, b.name);
  }

  [...byDay.values()].slice(0, 7).forEach(n => keep.add(n));
  [...byWeek.values()].slice(0, 4).forEach(n => keep.add(n));
  [...byMonth.values()].slice(0, 6).forEach(n => keep.add(n));

  for (const b of backups) {
    if (!keep.has(b.name)) {
      try { fs.unlinkSync(path.join(config.BACKUPS_DIR, b.name)); } catch {}
    }
  }
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

module.exports = { createBackup, listBackups, applyRetention };
