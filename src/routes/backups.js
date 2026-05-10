// Backup routes: list, create, download, delete, restore
const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { logActivity } = require('../data/store');
const { getScheduler, saveScheduler } = require('../data/settings');
const { sendDiscord } = require('../services/discord');
const { createBackup } = require('../services/backup');
const { isWithinDir } = require('./files');
const sc = require('../services/server-control');

const execAsync = promisify(exec);
const router = express.Router();

router.get('/backups', auth, requirePerm('backups.read'), (req, res) => {
  if (!fs.existsSync(config.BACKUPS_DIR)) return res.json({ backups: [] });
  const backups = fs.readdirSync(config.BACKUPS_DIR)
    .filter(f => f.endsWith('.zip'))
    .map(name => {
      const stat = fs.statSync(path.join(config.BACKUPS_DIR, name));
      return { name, size: stat.size, created: stat.mtime };
    })
    .sort((a, b) => new Date(b.created) - new Date(a.created));
  res.json({ backups });
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

router.get('/backups/download', auth, requirePerm('backups.read'), (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: 'Kein Name angegeben' });
  const fullPath = path.resolve(config.BACKUPS_DIR, name);
  if (!isWithinDir(config.BACKUPS_DIR, fullPath)) return res.status(403).json({ error: 'Zugriff verweigert' });
  if (fs.existsSync(fullPath)) res.download(fullPath);
  else res.status(404).json({ error: 'Nicht gefunden' });
});

router.delete('/backups/:name', auth, requirePerm('backups.manage'), (req, res) => {
  const fullPath = path.resolve(config.BACKUPS_DIR, req.params.name || '');
  if (!isWithinDir(config.BACKUPS_DIR, fullPath)) return res.status(403).json({ error: 'Zugriff verweigert' });
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    logActivity(req.user.username, `Backup geloescht: ${req.params.name}`);
  }
  res.json({ success: true });
});

router.post('/backups/restore/:name', auth, requirePerm('backups.manage'), async (req, res) => {
  const fullPath = path.resolve(config.BACKUPS_DIR, req.params.name || '');
  if (!isWithinDir(config.BACKUPS_DIR, fullPath)) return res.status(403).json({ error: 'Zugriff verweigert' });
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Backup nicht gefunden' });

  try {
    const wasRunning = await sc.isServerActive();
    if (wasRunning) {
      await sc.systemctl('stop');
      for (let i = 0; i < 30; i++) {
        if (!(await sc.isServerActive())) break;
        await sc.delay(1000);
      }
    }

    const tempDir = `/tmp/backup-restore-${Date.now()}`;
    fs.mkdirSync(tempDir, { recursive: true });
    await execAsync(`unzip -o "${fullPath}" -d "${tempDir}"`, { timeout: 120000 });

    // Remove whitelist from backup (panel is source of truth)
    const extractedWhitelist = path.join(tempDir, 'whitelist.json');
    if (fs.existsSync(extractedWhitelist)) fs.unlinkSync(extractedWhitelist);

    await execAsync(`cp -rf "${tempDir}/"* "${config.SERVER_DIR}/"`, { timeout: 60000 });
    await execAsync(`chown -R hytale:hytale "${config.SERVER_DIR}"`, { timeout: 30000 });
    fs.rmSync(tempDir, { recursive: true, force: true });

    if (wasRunning) {
      await sc.systemctl('start');
    }

    logActivity(req.user.username, `Backup wiederhergestellt: ${req.params.name}`);
    sendDiscord(`Backup wiederhergestellt: ${req.params.name}`, 15105570);
    res.json({ success: true, message: 'Backup wiederhergestellt' });
  } catch (e) {
    logActivity(req.user.username, `Restore fehlgeschlagen: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
