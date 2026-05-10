// Server update routes: check, install, status, verification
const express = require('express');
const fs = require('fs');
const { exec, execSync } = require('child_process');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { logActivity } = require('../data/store');

const router = express.Router();

function verifyInstallation() {
  try {
    if (!fs.existsSync(config.HASH_FILE)) return { verified: false, reason: 'no_hash_file' };
    if (!fs.existsSync(config.SERVER_JAR)) return { verified: false, reason: 'jar_missing' };
    const hashes = JSON.parse(fs.readFileSync(config.HASH_FILE, 'utf8'));
    const actual = execSync(`sha256sum "${config.SERVER_JAR}" | cut -d" " -f1`, { encoding: 'utf8' }).trim();
    if (actual !== hashes.jarHash) {
      return { verified: false, reason: 'hash_mismatch',
        expected: hashes.jarHash?.substring(0, 16), actual: actual?.substring(0, 16) };
    }
    return { verified: true, version: hashes.version, installedAt: hashes.installedAt };
  } catch (e) {
    return { verified: false, reason: 'error', message: e.message };
  }
}

router.get('/update/status', auth, (req, res) => {
  try {
    let status = { status: 'unknown', message: 'Noch nicht geprueft' };
    if (fs.existsSync(config.UPDATE_STATUS_FILE)) {
      status = JSON.parse(fs.readFileSync(config.UPDATE_STATUS_FILE, 'utf8'));
    }
    status.verification = verifyInstallation();
    if (status.status === 'current' && !status.verification.verified) {
      status.status = 'warning';
      status.message = `Version stimmt, aber Dateien nicht verifiziert: ${status.verification.reason}`;
    }
    res.json(status);
  } catch (e) {
    res.json({ status: 'error', message: e.message });
  }
});

router.post('/update/check', auth, requirePerm('server.control'), async (req, res) => {
  try {
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    await execAsync(`${config.UPDATE_SCRIPT} --check-only`, { timeout: 60000 });
    if (fs.existsSync(config.UPDATE_STATUS_FILE)) {
      res.json(JSON.parse(fs.readFileSync(config.UPDATE_STATUS_FILE, 'utf8')));
    } else {
      res.json({ status: 'unknown' });
    }
  } catch (e) {
    res.json({ status: 'error', message: e.message });
  }
});

router.post('/update/install', auth, requirePerm('server.control'), (req, res) => {
  logActivity(req.user.username, 'Update gestartet');
  res.json({ success: true, message: 'Update gestartet' });
  exec(config.UPDATE_SCRIPT);
});

module.exports = router;
