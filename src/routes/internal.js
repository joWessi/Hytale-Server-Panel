// Internal endpoints for server-side scripts (token-protected, localhost only)
const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const { recordCrash } = require('../services/crash-stats');
const { logActivity } = require('../data/store');

const router = express.Router();

function tokenAuth(req, res, next) {
  if (!config.CRASH_NOTIFY_TOKEN) {
    return res.status(503).json({ error: 'Internal token not configured' });
  }
  const provided = req.headers['x-internal-token'] || '';
  // Constant-time comparison
  let ok = false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(config.CRASH_NOTIFY_TOKEN);
    ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { /* mismatch */ }
  if (!ok) return res.status(401).json({ error: 'Unauthorized' });
  // Reject non-loopback
  const ip = req.ip || req.connection?.remoteAddress || '';
  if (!ip.startsWith('127.') && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
    return res.status(403).json({ error: 'Loopback only' });
  }
  next();
}

router.post('/internal/crash', tokenAuth, (req, res) => {
  const reason = (req.body?.reason || 'unknown').toString().slice(0, 200);
  logActivity('system', `Crash gemeldet: ${reason}`);
  const result = recordCrash();
  res.json({ ok: true, ...result });
});

module.exports = router;
