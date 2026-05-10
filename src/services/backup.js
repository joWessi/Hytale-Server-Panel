// Shared backup creation logic (used by both manual and auto-backup)
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const config = require('../config');
const { runScript, delay } = require('./server-control');

const BACKUP_CONFIG_FILES = ['config.json', 'permissions.json', 'whitelist.json', 'bans.json'];

/**
 * Create a hot backup: save world, snapshot files, then archive.
 * @param {boolean} isServerRunning - whether the server is currently active
 * @returns {Promise<{name: string, success: boolean, message?: string}>}
 */
async function createBackup(isServerRunning) {
  if (!fs.existsSync(config.SERVER_DIR) || fs.readdirSync(config.SERVER_DIR).length === 0) {
    return { name: '', success: false, message: 'Server-Ordner leer' };
  }

  // Hot backup: trigger world save without stopping
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

    // Snapshot to temp dir for consistency during hot backup
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
        // Fallback: archive directly (less consistent but better than nothing)
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
      rotateBackups();
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
  } catch { /* ignore cleanup errors */ }
}

/**
 * Remove oldest backups beyond MAX_BACKUPS limit.
 */
function rotateBackups() {
  if (!fs.existsSync(config.BACKUPS_DIR)) return;
  const backups = fs.readdirSync(config.BACKUPS_DIR)
    .filter(f => f.endsWith('.zip'))
    .map(name => ({ name, time: fs.statSync(path.join(config.BACKUPS_DIR, name)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);

  while (backups.length > config.MAX_BACKUPS) {
    const old = backups.pop();
    try { fs.unlinkSync(path.join(config.BACKUPS_DIR, old.name)); } catch { /* ignore */ }
  }
}

module.exports = { createBackup, rotateBackups };
