// Config file editor routes: list, read, write config files
const express = require('express');
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { resolveServerPath, isWithinDir } = require('./files');
const { logActivity } = require('../data/store');

const router = express.Router();

router.get('/config/files', auth, requirePerm('config.read'), (req, res) => {
  if (!fs.existsSync(cfg.SERVER_DIR)) return res.json({ files: [] });

  const files = [];
  const scanDir = (dir, prefix = '') => {
    try {
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        const rel = prefix ? `${prefix}/${f}` : f;
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory() && !f.startsWith('.') && f !== 'node_modules' && f !== 'logs') {
            scanDir(full, rel);
          } else if (cfg.CONFIG_EXTENSIONS.some(ext => f.endsWith(ext))) {
            files.push(rel);
          }
        } catch { /* skip unreadable files */ }
      }
    } catch { /* skip unreadable directories */ }
  };

  scanDir(cfg.SERVER_DIR);
  res.json({ files: files.sort() });
});

router.get('/config/read', auth, requirePerm('config.read'), (req, res) => {
  const file = req.query.file;
  if (!file) return res.status(400).json({ error: 'Keine Datei angegeben' });

  const fullPath = resolveServerPath(file);
  if (!isWithinDir(cfg.SERVER_DIR, fullPath)) return res.status(403).json({ error: 'Zugriff verweigert' });
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Nicht gefunden' });

  try {
    res.json({ content: fs.readFileSync(fullPath, 'utf8') });
  } catch {
    res.status(500).json({ error: 'Lesefehler' });
  }
});

router.post('/config/write', auth, requirePerm('config.write'), (req, res) => {
  const { file, content } = req.body;
  if (!file) return res.status(400).json({ error: 'Keine Datei angegeben' });
  if (!cfg.CONFIG_EXTENSIONS.some(ext => file.endsWith(ext))) {
    return res.status(400).json({ error: 'Ungueltiger Dateityp' });
  }

  const fullPath = resolveServerPath(file);
  if (!isWithinDir(cfg.SERVER_DIR, fullPath)) return res.status(403).json({ error: 'Zugriff verweigert' });

  try {
    fs.writeFileSync(fullPath, content);
    logActivity(req.user.username, `Config geaendert: ${file}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Schreibfehler' });
  }
});

module.exports = router;
