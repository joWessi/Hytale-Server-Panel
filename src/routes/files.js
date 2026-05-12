// File browser routes
const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const multer = require('multer');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { uploadLimiter, downloadLimiter } = require('../middleware/security');
const { logActivity } = require('../data/store');

const router = express.Router();

// Ensure upload tmp dir exists
try { fs.mkdirSync(config.UPLOAD_TMP, { recursive: true }); } catch {}

const upload = multer({
  dest: config.UPLOAD_TMP,
  limits: { fileSize: config.MAX_UPLOAD_SIZE },
});

// ── Path safety ─────────────────────────────────────────────
function resolveServerPath(reqPath) {
  const safePath = reqPath || '/';
  const normalized = safePath.startsWith('/') ? '.' + safePath : safePath;
  return path.resolve(config.SERVER_DIR, normalized);
}

function isWithinDir(rootDir, fullPath) {
  const resolved = path.resolve(fullPath);
  const root = path.resolve(rootDir);
  return resolved === root || resolved.startsWith(root + path.sep);
}

// Protected files that may not be overwritten/deleted/renamed via file API
const PROTECTED_NAMES = new Set(['HytaleServer.jar', 'send_cmd.sh', 'send_save.sh', 'get_players.sh']);

function isProtected(absPath) {
  return PROTECTED_NAMES.has(path.basename(absPath));
}

function cleanupTmp(file) {
  if (file?.path) fs.promises.unlink(file.path).catch(() => {});
}

// Periodically clean stale uploads (>1h)
setInterval(() => {
  fs.readdir(config.UPLOAD_TMP, (err, files) => {
    if (err) return;
    const cutoff = Date.now() - 3600000;
    for (const f of files) {
      const p = path.join(config.UPLOAD_TMP, f);
      fs.stat(p, (e, st) => {
        if (!e && st.mtimeMs < cutoff) fs.unlink(p, () => {});
      });
    }
  });
}, 30 * 60 * 1000).unref();

// ── Routes ──────────────────────────────────────────────────
router.get('/files', auth, requirePerm('files.read'), async (req, res) => {
  const reqPath = req.query.path || '/';
  const fullPath = resolveServerPath(reqPath);

  if (!isWithinDir(config.SERVER_DIR, fullPath)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }
  if (!fs.existsSync(fullPath)) return res.json({ files: [] });

  try {
    const entries = await fsp.readdir(fullPath, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (e) => {
      const full = path.join(fullPath, e.name);
      let size = 0, mtime = 0;
      try {
        const st = await fsp.stat(full);
        size = st.size;
        mtime = st.mtimeMs;
      } catch { /* dangling symlink */ }
      return {
        name: e.name,
        isDirectory: e.isDirectory(),
        size,
        mtime,
        protected: isProtected(full),
      };
    }));
    res.json({ files });
  } catch {
    res.json({ files: [] });
  }
});

router.get('/files/download', auth, requirePerm('files.read'), downloadLimiter, (req, res) => {
  const reqPath = req.query.path || '';
  const fullPath = resolveServerPath(reqPath);
  if (!isWithinDir(config.SERVER_DIR, fullPath)) return res.status(403).json({ error: 'Zugriff verweigert' });
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return res.status(404).json({ error: 'Nicht gefunden' });
  }
  res.download(fullPath);
});

router.post('/files/upload', auth, requirePerm('files.write'), uploadLimiter,
  upload.single('file'), (req, res) => {
    const targetDir = req.body.path || '/';
    const fullDir = resolveServerPath(targetDir);

    if (!isWithinDir(config.SERVER_DIR, fullDir)) {
      cleanupTmp(req.file);
      return res.status(403).json({ error: 'Zugriff verweigert' });
    }
    if (!req.file) return res.status(400).json({ error: 'Keine Datei' });

    const baseName = path.basename(req.file.originalname);
    if (isProtected(baseName)) {
      cleanupTmp(req.file);
      return res.status(403).json({ error: 'Diese Datei ist geschützt' });
    }

    try {
      if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
      const dest = path.join(fullDir, baseName);
      fs.renameSync(req.file.path, dest);
      logActivity(req.user.username, `Upload: ${path.relative(config.SERVER_DIR, dest)}`);
      res.json({ success: true });
    } catch (e) {
      cleanupTmp(req.file);
      res.status(500).json({ error: e.message });
    }
  });

router.delete('/files', auth, requirePerm('files.write'), (req, res) => {
  const reqPath = req.body?.path;
  if (!reqPath || reqPath === '/' || reqPath === '') {
    return res.status(400).json({ error: 'Pfad erforderlich' });
  }
  const fullPath = resolveServerPath(reqPath);
  if (!isWithinDir(config.SERVER_DIR, fullPath) || fullPath === path.resolve(config.SERVER_DIR)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }
  if (isProtected(fullPath)) return res.status(403).json({ error: 'Datei ist geschützt' });
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Nicht gefunden' });
  try {
    const st = fs.statSync(fullPath);
    if (st.isDirectory()) fs.rmSync(fullPath, { recursive: true, force: true });
    else fs.unlinkSync(fullPath);
    logActivity(req.user.username, `Gelöscht: ${path.relative(config.SERVER_DIR, fullPath)}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/files/rename', auth, requirePerm('files.write'), (req, res) => {
  const { from, to } = req.body || {};
  if (!from || !to) return res.status(400).json({ error: 'Quelle und Ziel erforderlich' });
  const fromPath = resolveServerPath(from);
  const toPath = resolveServerPath(to);
  if (!isWithinDir(config.SERVER_DIR, fromPath) || !isWithinDir(config.SERVER_DIR, toPath)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }
  if (isProtected(fromPath) || isProtected(toPath)) {
    return res.status(403).json({ error: 'Datei ist geschützt' });
  }
  if (!fs.existsSync(fromPath)) return res.status(404).json({ error: 'Quelle nicht gefunden' });
  if (fs.existsSync(toPath)) return res.status(400).json({ error: 'Ziel existiert bereits' });
  try {
    fs.renameSync(fromPath, toPath);
    logActivity(req.user.username, `Umbenannt: ${from} -> ${to}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/files/mkdir', auth, requirePerm('files.write'), (req, res) => {
  const { path: reqPath } = req.body || {};
  if (!reqPath) return res.status(400).json({ error: 'Pfad erforderlich' });
  const fullPath = resolveServerPath(reqPath);
  if (!isWithinDir(config.SERVER_DIR, fullPath)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }
  if (fs.existsSync(fullPath)) return res.status(400).json({ error: 'Existiert bereits' });
  try {
    fs.mkdirSync(fullPath, { recursive: true });
    logActivity(req.user.username, `Verzeichnis erstellt: ${reqPath}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.resolveServerPath = resolveServerPath;
module.exports.isWithinDir = isWithinDir;
module.exports.isProtected = isProtected;
