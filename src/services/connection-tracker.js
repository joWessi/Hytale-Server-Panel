// Watch the server console log for join attempts that get rejected by the
// whitelist and expose them via /api/whitelist/pending so the panel admin can
// approve players without having to scroll through the raw log.
const fs = require('fs');
const config = require('../config');

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

const PENDING_TTL_MS = 60 * 60 * 1000;
const MAX_PENDING = 50;

// Rolling window of recent JWTValidator lines, used to look up the (name, uuid)
// for a disconnect event by scanning recent history.
const recentAuth = []; // [{name, uuid, t}]
const MAX_AUTH_HISTORY = 100;

// Current pending requests, deduped by UUID. Persisted in memory only.
const pending = new Map(); // uuid -> {name, uuid, lastAttempt}

let lastSize = 0;

function rememberAuth(name, uuid) {
  recentAuth.push({ name, uuid, t: Date.now() });
  while (recentAuth.length > MAX_AUTH_HISTORY) recentAuth.shift();
}

function findRecentAuth() {
  // Most recent entry in the last 30 seconds is the player whose connection
  // we just rejected.
  const cutoff = Date.now() - 30000;
  for (let i = recentAuth.length - 1; i >= 0; i--) {
    if (recentAuth[i].t >= cutoff) return recentAuth[i];
  }
  return null;
}

function addPending(name, uuid) {
  pending.set(uuid, { name, uuid, lastAttempt: Date.now() });
  // Trim oldest if over MAX_PENDING
  while (pending.size > MAX_PENDING) {
    const oldestKey = [...pending.entries()].sort((a, b) => a[1].lastAttempt - b[1].lastAttempt)[0][0];
    pending.delete(oldestKey);
  }
}

function pruneExpired() {
  const cutoff = Date.now() - PENDING_TTL_MS;
  for (const [k, v] of pending) {
    if (v.lastAttempt < cutoff) pending.delete(k);
  }
}

function getPending() {
  pruneExpired();
  return [...pending.values()].sort((a, b) => b.lastAttempt - a.lastAttempt);
}

function clearPending(uuid) {
  if (uuid) pending.delete(uuid);
  else pending.clear();
}

const AUTH_RE = /Identity token validated successfully for user (\S+) \(UUID:\s*([0-9a-f-]{36})\)/i;
const REJECT_RE = /client\.general\.disconnect\.notWhitelisted/i;

function processLine(line) {
  const clean = stripAnsi(line);
  let m;
  if ((m = AUTH_RE.exec(clean))) {
    rememberAuth(m[1], m[2].toLowerCase());
    return;
  }
  if (REJECT_RE.test(clean)) {
    const last = findRecentAuth();
    if (last) addPending(last.name, last.uuid);
  }
}

async function readSince(offset) {
  return new Promise((resolve) => {
    try {
      const stream = fs.createReadStream(config.CONSOLE_LOG, { start: offset, encoding: 'utf8' });
      let data = '';
      stream.on('data', (c) => { data += c; });
      stream.on('end', () => resolve(data));
      stream.on('error', () => resolve(''));
    } catch { resolve(''); }
  });
}

async function onChange() {
  try {
    const stat = fs.statSync(config.CONSOLE_LOG);
    if (stat.size < lastSize) lastSize = 0;
    if (stat.size <= lastSize) return;
    const data = await readSince(lastSize);
    lastSize = stat.size;
    data.split('\n').forEach(processLine);
  } catch { /* ignore */ }
}

function start() {
  if (fs.existsSync(config.CONSOLE_LOG)) {
    try { lastSize = fs.statSync(config.CONSOLE_LOG).size; } catch { lastSize = 0; }
  }
  fs.watchFile(config.CONSOLE_LOG, { interval: 1000, persistent: false }, (curr, prev) => {
    if (curr.size === 0 && prev.size > 0) { lastSize = 0; return; }
    if (curr.size !== prev.size || curr.mtimeMs !== prev.mtimeMs) onChange();
  });
}

module.exports = { start, getPending, clearPending };
