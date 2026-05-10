// File browser routes: list, download, upload
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { logActivity } = require('../data/store');

const router = express.Router();
const upload = multer({ dest: '/tmp/hytale-uploads', limits: { fileSize: config.MAX_UPLOAD_SIZE } });

/**
 * Resolve a request path to an absolute path within SERVER_DIR.
 */
function resolveServerPath(reqPath) {
  const safePath = reqPath || '/';
  const normalized = safePath.startsWith('/') ? '.' + safePath : safePath;
  return path.resolve(config.SERVER_DIR, normalized);
}

/**
 * Check if a path is within a given root directory (prevent path traversal).
 */
function isWithinDir(rootDir, fullPath) {
  const resolved = path.resolve(fullPath);
  const root = path.resolve(rootDir);
  return resolved === root || resolved.startsWith(root + path.sep);
}

router.get('/files', auth, requirePerm('files.read'), (req, res) => {
  const reqPath = req.query.path || '/';
  const fullPath = resolveServerPath(reqPath);

  if (!isWithinDir(config.SERVER_DIR, fullPath)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }
  if (!fs.existsSync(fullPath)) return res.json({ files: [] });

  try {
    const files = fs.readdirSync(fullPath).map(name => {
      const stat = fs.statSync(path.join(fullPath, name));
      return { name, isDirectory: stat.isDirectory(), size: stat.size };
    });
    res.json({ files });
  } catch {
    res.json({ files: [] });
  }
});

router.get('/files/download', auth, requirePerm('files.read'), (req, res) => {
  const reqPath = req.query.path || '';
  const fullPath = resolveServerPath(reqPath);

  if (!isWithinDir(config.SERVER_DIR, fullPath)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    res.download(fullPath);
  } else {
    res.status(404).json({ error: 'Nicht gefunden' });
  }
});

router.post('/files/upload', auth, requirePerm('files.write'), upload.single('file'), (req, res) => {
  const targetDir = req.body.path || '/';
  const fullDir = resolveServerPath(targetDir);

  if (!isWithinDir(config.SERVER_DIR, fullDir)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });

  if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });

  const dest = path.join(fullDir, path.basename(req.file.originalname));
  fs.renameSync(req.file.path, dest);
  logActivity(req.user.username, `Upload: ${path.relative(config.SERVER_DIR, dest)}`);
  res.json({ success: true });
});

module.exports = router;
// Export helpers for use in config routes
module.exports.resolveServerPath = resolveServerPath;
module.exports.isWithinDir = isWithinDir;
