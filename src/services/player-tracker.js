// Single log watcher that backs three views the panel cares about:
//   1. knownPlayers  — every (name, uuid) ever observed; persisted so they
//                       survive panel restarts and can drive UUID dropdowns.
//   2. pending       — players whose last attempt was a notWhitelisted reject
//                       (in-memory; clears once the admin assigns a UUID).
//   3. online        — currently connected players; rebuilt from log replay.
const fs = require('fs');
const config = require('../config');
const { readJSON, writeJSON } = require('../data/store');

const KNOWN_FILE = require('path').join(config.DATA_DIR, 'known-players.json');
const PENDING_TTL_MS = 60 * 60 * 1000;

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
const norm = (uuid) => String(uuid || '').toLowerCase().replace(/-/g, '');

// uuid -> { uuid, name, firstSeen, lastSeen }
const known = new Map();
// uuid -> { uuid, name, lastAttempt }
const pending = new Map();
// uuid -> { uuid, name, since, connId? }
const online = new Map();

// Tail state
let lastSize = 0;
// Most recent JWT-validated (name, uuid, t) line, used to attribute the
// subsequent `was closed` (notWhitelisted) to a player.
const recentAuth = [];

function loadKnown() {
  const data = readJSON(KNOWN_FILE, []);
  if (Array.isArray(data)) {
    for (const p of data) {
      if (p?.uuid && p?.name) known.set(norm(p.uuid), p);
    }
  }
}

function persistKnown() {
  writeJSON(KNOWN_FILE, [...known.values()]);
}

function noteKnown(name, uuid) {
  const key = norm(uuid);
  const now = Date.now();
  const existing = known.get(key);
  if (existing) {
    existing.name = name;
    existing.lastSeen = now;
  } else {
    known.set(key, { uuid, name, firstSeen: now, lastSeen: now });
  }
  persistKnown();
}

function notePending(name, uuid) {
  pending.set(norm(uuid), { uuid, name, lastAttempt: Date.now() });
}

function notePlayerOnline(name, uuid) {
  online.set(norm(uuid), { uuid, name, since: Date.now() });
}

function notePlayerOffline(uuid) {
  if (uuid) online.delete(norm(uuid));
}

function pruneExpiredPending() {
  const cutoff = Date.now() - PENDING_TTL_MS;
  for (const [k, v] of pending) if (v.lastAttempt < cutoff) pending.delete(k);
}

// ── Pattern matchers (anchored to actual Hytale 2026.x log lines) ────────────
const AUTH_RE = /Identity token validated successfully for user (\S+) \(UUID:\s*([0-9a-f-]{36})\)/i;
const MUTUAL_RE = /Mutual authentication complete for (\S+) \(([0-9a-f-]{36})\)/i;
const REJECT_RE = /client\.general\.disconnect\.notWhitelisted/i;
const CLOSED_RE = /\{Setup\([^}]+\), (\S+), ([0-9a-f-]{36}), [A-Z]+\} was closed/i;
const SETUP_OK_RE = /Connection complete for (\S+) \(([0-9a-f-]{36})\).*transitioning to setup/i;

function rememberAuth(name, uuid) {
  recentAuth.push({ name, uuid, t: Date.now() });
  while (recentAuth.length > 100) recentAuth.shift();
}

function findRecentAuth() {
  const cutoff = Date.now() - 30000;
  for (let i = recentAuth.length - 1; i >= 0; i--) {
    if (recentAuth[i].t >= cutoff) return recentAuth[i];
  }
  return null;
}

function processLine(line) {
  const clean = stripAnsi(line);
  let m;
  if ((m = AUTH_RE.exec(clean))) {
    rememberAuth(m[1], m[2].toLowerCase());
    noteKnown(m[1], m[2]);
    return;
  }
  if ((m = MUTUAL_RE.exec(clean))) {
    noteKnown(m[1], m[2]);
    return;
  }
  if ((m = SETUP_OK_RE.exec(clean))) {
    // Player has completed handshake and is entering the world. We can mark
    // them online here, but if the whitelist rejects them immediately after
    // we'll still see the `was closed` line which removes them.
    notePlayerOnline(m[1], m[2]);
    noteKnown(m[1], m[2]);
    return;
  }
  if (REJECT_RE.test(clean)) {
    const last = findRecentAuth();
    if (last) {
      notePending(last.name, last.uuid);
      noteKnown(last.name, last.uuid);
    }
    return;
  }
  if ((m = CLOSED_RE.exec(clean))) {
    notePlayerOffline(m[2]);
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
  loadKnown();
  if (fs.existsSync(config.CONSOLE_LOG)) {
    try { lastSize = fs.statSync(config.CONSOLE_LOG).size; } catch { lastSize = 0; }
  }
  fs.watchFile(config.CONSOLE_LOG, { interval: 1000, persistent: false }, (curr, prev) => {
    if (curr.size === 0 && prev.size > 0) { lastSize = 0; return; }
    if (curr.size !== prev.size || curr.mtimeMs !== prev.mtimeMs) onChange();
  });
}

function getKnown() {
  return [...known.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

function getPending() {
  pruneExpiredPending();
  return [...pending.values()].sort((a, b) => b.lastAttempt - a.lastAttempt);
}

function clearPending(uuid) {
  if (uuid) pending.delete(norm(uuid));
  else pending.clear();
}

function getOnline() {
  return [...online.values()];
}

function isOnline(uuid) {
  return uuid ? online.has(norm(uuid)) : false;
}

module.exports = {
  start, getKnown, getPending, clearPending, getOnline, isOnline,
};
