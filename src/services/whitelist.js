// Whitelist management: panel whitelist is the source of truth
const fs = require('fs');
const config = require('../config');
const { readJSON, writeJSON, logActivity } = require('../data/store');
const { getUsers } = require('../data/users');

function getWhitelist() {
  return readJSON(config.WHITELIST_FILE, { enabled: true, list: [] });
}

function saveWhitelist(wl) {
  writeJSON(config.WHITELIST_FILE, wl);
}

function addToWhitelist(uuid) {
  if (!uuid) return;
  const wl = getWhitelist();
  if (!wl.list.includes(uuid)) {
    wl.list.push(uuid);
    saveWhitelist(wl);
  }
}

function removeFromWhitelist(uuid) {
  if (!uuid) return;
  const wl = getWhitelist();
  wl.list = wl.list.filter(id => id !== uuid);
  saveWhitelist(wl);
}

function isWhitelisted(uuid) {
  if (!uuid) return false;
  return getWhitelist().list.includes(uuid);
}

/**
 * Sync whitelist from enabled panel users to gameserver whitelist file.
 */
function syncWhitelist() {
  const users = getUsers();
  const validUuids = users
    .filter(u => u.enabled !== false && u.uuid)
    .map(u => u.uuid);

  const wl = getWhitelist();
  const oldList = [...wl.list];
  wl.list = validUuids;
  saveWhitelist(wl);

  const removed = oldList.filter(id => !validUuids.includes(id));
  const added = validUuids.filter(id => !oldList.includes(id));
  if (removed.length > 0) logActivity('system', `Whitelist sync: ${removed.length} entfernt`);
  if (added.length > 0) logActivity('system', `Whitelist sync: ${added.length} hinzugefuegt`);

  // Copy panel whitelist to gameserver
  try {
    fs.copyFileSync(config.WHITELIST_FILE, config.GAMESERVER_WHITELIST);
  } catch { /* gameserver dir may not exist yet */ }
}

module.exports = {
  getWhitelist, saveWhitelist, addToWhitelist, removeFromWhitelist,
  isWhitelisted, syncWhitelist,
};
