// Backup routes
const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { downloadLimiter } = require('../middleware/security');
const { logActivity } = require('../data/store');
const { getSettings, getScheduler, saveScheduler } = require('../data/settings');
const { sendDiscord } = require('../services/discord');
const { createBackup, listBackups } = require('../services/backup');
const { isWithinDir } = require('./files');
const sc = require('../services/server-control');

const execFileAsync = promisify(execFile);
const router = express.Router();

router.get('/backups', auth, requirePerm('backups.read'), (req, res) => {
  const settings = getSettings();
  res.json({
    backups: listBackups().map(b => ({ name: b.name, size: b.size, created: new Date(b.mtime) })),
    maxBackups: settings.maxBackups,
    retention: settings.backupRetention,
  });
});

router.post('/backups', auth, requirePerm('backups.manage'), async (req, res) => {
  const running = await sc.isServerActive();
  const result = await createBackup(running);

  if (result.success) {
    const s = getScheduler();
    s.lastBackup = new Date().toISOString();
    saveScheduler(s);
    sendDiscord(`Backup erstellt: ${result.name}`, 3066993);
    logActivity(req.user.username, `Backup erstellt: ${result.name}`);
  }
  res.json({ success: result.success, message: result.message });
});

router.get('/backups/download', auth, requirePerm('backups.read'), downloadLimiter, (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: 'Kein Name angegeben' });
  const fullPath = path.resolve(config.BACKUPS_DIR, name);
  if (!isWithinDir(config.BACKUPS_DIR, fullPath)) return res.status(403).json({ error: 'Zugriff verweigert' });
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Nicht gefunden' });
  res.download(fullPath);
});

router.delete('/backups/:name', auth, requirePerm('backups.manage'), (req, res) => {
  const fullPath = path.resolve(config.BACKUPS_DIR, req.params.name || '');
  if (!isWithinDir(config.BACKUPS_DIR, fullPath)) return res.status(403).json({ error: 'Zugriff verweigert' });
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    logActivity(req.user.username, `Backup gelöscht: ${req.params.name}`);
  }
  res.json({ success: true });
});

router.post('/backups/restore/:name', auth, requirePerm('backups.manage'), async (req, res) => {
  const fullPath = path.resolve(config.BACKUPS_DIR, req.params.name || '');
  if (!isWithinDir(config.BACKUPS_DIR, fullPath)) return res.status(403).json({ error: 'Zugriff verweigert' });
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Backup nicht gefunden' });

  const tempDir = `/tmp/backup-restore-${Date.now()}`;
  try {
    const wasRunning = await sc.isServerActive();
    if (wasRunning) {
      await sc.systemctl('stop').catch(() => {});
      for (let i = 0; i < 30; i++) {
        if (!(await sc.isServerActive())) break;
        await sc.delay(1000);
      }
    }

    fs.mkdirSync(tempDir, { recursive: true });
    await execFileAsync('unzip', ['-o', fullPath, '-d', tempDir], { timeout: 120000 });

    // Whitelist is panel-managed, never restore from backup
    const extractedWhitelist = path.join(tempDir, 'whitelist.json');
    if (fs.existsSync(extractedWhitelist)) fs.unlinkSync(extractedWhitelist);

    // Copy contents into SERVER_DIR
    for (const entry of fs.readdirSync(tempDir)) {
      const src = path.join(tempDir, entry);
      const dst = path.join(config.SERVER_DIR, entry);
      if (fs.statSync(src).isDirectory()) {
        fs.cpSync(src, dst, { recursive: true, force: true });
      } else {
        fs.copyFileSync(src, dst);
      }
    }
    await execFileAsync('chown', ['-R', 'hytale:hytale', config.SERVER_DIR], { timeout: 30000 }).catch(() => {});

    if (wasRunning) await sc.systemctl('start').catch(() => {});

    logActivity(req.user.username, `Backup wiederhergestellt: ${req.params.name}`);
    sendDiscord(`Backup wiederhergestellt: ${req.params.name}`, 15105570);
    res.json({ success: true, message: 'Backup wiederhergestellt' });
  } catch (e) {
    logActivity(req.user.username, `Restore fehlgeschlagen: ${e.message}`);
    res.status(500).json({ error: e.message });
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});

module.exports = router;
