// Config file editor routes
const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const cfg = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { resolveServerPath, isWithinDir } = require('./files');
const { logActivity } = require('../data/store');

const router = express.Router();

// Files that may not be edited via config editor (managed by panel)
const PANEL_MANAGED = new Set(['whitelist.json']);

const SKIP_DIRS = new Set(['node_modules', 'logs', '.git']);

async function scanDir(dir, prefix = '', acc = []) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
  catch { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) {
        await scanDir(full, rel, acc);
      }
    } else if (cfg.TEXT_EXTENSIONS.some(ext => e.name.endsWith(ext))) {
      acc.push(rel);
    }
  }
  return acc;
}

router.get('/config/files', auth, requirePerm('config.read'), async (req, res) => {
  if (!fs.existsSync(cfg.SERVER_DIR)) return res.json({ files: [] });
  const files = await scanDir(cfg.SERVER_DIR);
  res.json({ files: files.sort() });
});

router.get('/config/read', auth, requirePerm('config.read'), (req, res) => {
  const file = req.query.file;
  if (!file) return res.status(400).json({ error: 'Keine Datei angegeben' });

  const fullPath = resolveServerPath(file);
  if (!isWithinDir(cfg.SERVER_DIR, fullPath)) return res.status(403).json({ error: 'Zugriff verweigert' });
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Nicht gefunden' });

  try {
    const stat = fs.statSync(fullPath);
    if (stat.size > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Datei zu groß (>5 MB)' });
    }
    res.json({
      content: fs.readFileSync(fullPath, 'utf8'),
      managed: PANEL_MANAGED.has(path.basename(fullPath)),
    });
  } catch {
    res.status(500).json({ error: 'Lesefehler' });
  }
});

router.post('/config/write', auth, requirePerm('config.write'), (req, res) => {
  const { file, content } = req.body || {};
  if (!file) return res.status(400).json({ error: 'Keine Datei angegeben' });
  if (typeof content !== 'string') return res.status(400).json({ error: 'Inhalt fehlt' });
  if (!cfg.TEXT_EXTENSIONS.some(ext => file.endsWith(ext))) {
    return res.status(400).json({ error: 'Ungültiger Dateityp' });
  }

  const fullPath = resolveServerPath(file);
  if (!isWithinDir(cfg.SERVER_DIR, fullPath)) return res.status(403).json({ error: 'Zugriff verweigert' });
  if (PANEL_MANAGED.has(path.basename(fullPath))) {
    return res.status(403).json({ error: 'Diese Datei wird vom Panel verwaltet' });
  }

  // Validate JSON if extension is .json
  if (fullPath.endsWith('.json')) {
    try { JSON.parse(content); }
    catch (e) { return res.status(400).json({ error: `JSON-Fehler: ${e.message}` }); }
  }

  try {
    // Atomic write
    const tmp = fullPath + '.tmp';
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, fullPath);
    logActivity(req.user.username, `Config geändert: ${file}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Schreibfehler' });
  }
});

module.exports = router;
