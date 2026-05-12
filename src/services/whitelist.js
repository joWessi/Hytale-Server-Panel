// Whitelist management — derived strictly from panel users (1 UUID per user).
// Direct edits to data/whitelist.json are not exposed via UI; emergency only.
const fs = require('fs');
const config = require('../config');
const { readJSON, writeJSON, logActivity } = require('../data/store');
const { getUsers } = require('../data/users');

const UUID_RE = /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/;

function isValidUuid(uuid) {
  return typeof uuid === 'string' && UUID_RE.test(uuid.trim());
}

function normalizeUuid(uuid) {
  return uuid.trim().toLowerCase().replace(/-/g, '');
}

function getWhitelist() {
  // enabled is always forced true — the panel is a private setup and the
  // expectation is that only registered users (those with a UUID set) can
  // join. Hytale's `whitelist status` command is buggy in current alpha but
  // the JSON `enabled` field IS respected by the access check.
  const wl = readJSON(config.WHITELIST_FILE, { enabled: true, list: [] });
  wl.enabled = true;
  if (!Array.isArray(wl.list)) wl.list = [];
  return wl;
}

function copyToGameserver() {
  try {
    fs.copyFileSync(config.WHITELIST_FILE, config.GAMESERVER_WHITELIST);
  } catch { /* gameserver dir may not exist yet */ }
}

function isWhitelisted(uuid) {
  if (!uuid) return false;
  const norm = normalizeUuid(uuid);
  return getWhitelist().list.some(u => normalizeUuid(u) === norm);
}

function syncWhitelist() {
  const wl = getWhitelist();
  const oldList = [...wl.list];

  const newList = [];
  const seen = new Set();
  for (const u of getUsers()) {
    if (u.enabled === false || !u.uuid) continue;
    const k = normalizeUuid(u.uuid);
    if (seen.has(k)) continue;
    seen.add(k);
    newList.push(u.uuid);
  }
  wl.list = newList;
  writeJSON(config.WHITELIST_FILE, wl);
  copyToGameserver();

  const removed = oldList.filter(id => !newList.includes(id));
  const added = newList.filter(id => !oldList.includes(id));
  if (removed.length) logActivity('system', `Whitelist sync: ${removed.length} entfernt`);
  if (added.length) logActivity('system', `Whitelist sync: ${added.length} hinzugefügt`);
}

module.exports = {
  getWhitelist, isWhitelisted, isValidUuid, syncWhitelist,
};
