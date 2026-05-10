// User management routes: CRUD, whitelist sync
const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { getUsers, saveUsers, getUserPermissions } = require('../data/users');
const { logActivity } = require('../data/store');
const { addToWhitelist, removeFromWhitelist, isWhitelisted, syncWhitelist } = require('../services/whitelist');

const router = express.Router();

router.get('/users', auth, requirePerm('users.manage'), (req, res) => {
  const users = getUsers().map(u => ({
    username: u.username,
    role: u.role,
    permissions: getUserPermissions(u),
    uuid: u.uuid || null,
    enabled: u.enabled !== false,
  }));
  res.json({ users });
});

router.post('/users', auth, requirePerm('users.manage'), (req, res) => {
  const { username, password, role, permissions } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });

  const users = getUsers();
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Benutzer existiert bereits' });
  }

  const newRole = role === 'admin' ? 'admin' : 'user';
  users.push({
    username,
    passwordHash: bcrypt.hashSync(password, config.BCRYPT_ROUNDS),
    role: newRole,
    permissions: newRole === 'admin' ? [] : (Array.isArray(permissions) ? permissions : []),
    enabled: true,
    tokenVersion: 0,
  });
  saveUsers(users);
  logActivity(req.user.username, `Benutzer erstellt: ${username}`);
  res.json({ success: true });
});

router.patch('/users/:username', auth, requirePerm('users.manage'), (req, res) => {
  const users = getUsers();
  const user = users.find(u => u.username === req.params.username);
  if (!user) return res.status(404).json({ error: 'Nicht gefunden' });
  if (user.username === 'admin') return res.status(400).json({ error: 'Admin kann nicht geaendert werden' });

  if (req.body.role) user.role = req.body.role === 'admin' ? 'admin' : 'user';
  if (user.role !== 'admin' && Array.isArray(req.body.permissions)) user.permissions = req.body.permissions;
  if (typeof req.body.uuid === 'string') user.uuid = req.body.uuid.trim() || null;

  if (typeof req.body.enabled === 'boolean') {
    const wasEnabled = user.enabled !== false;
    user.enabled = req.body.enabled;
    if (user.uuid) {
      if (req.body.enabled && !wasEnabled) {
        addToWhitelist(user.uuid);
        logActivity(req.user.username, `Whitelisted: ${user.username}`);
      } else if (!req.body.enabled && wasEnabled) {
        removeFromWhitelist(user.uuid);
        logActivity(req.user.username, `Von Whitelist entfernt: ${user.username}`);
      }
    }
  }

  // Invalidate existing tokens
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  saveUsers(users);
  syncWhitelist();
  logActivity(req.user.username, `Benutzer aktualisiert: ${user.username}`);
  res.json({ success: true });
});

router.delete('/users/:username', auth, requirePerm('users.manage'), (req, res) => {
  if (req.params.username === 'admin') return res.status(400).json({ error: 'Admin kann nicht geloescht werden' });
  const users = getUsers();
  const remaining = users.filter(u => u.username !== req.params.username);
  saveUsers(remaining);
  syncWhitelist();
  logActivity(req.user.username, `Benutzer geloescht: ${req.params.username}`);
  res.json({ success: true });
});

// User's own whitelist status
router.get('/users/me/whitelist', auth, (req, res) => {
  const users = getUsers();
  const user = users.find(u => u.username === req.user.username);
  if (!user) return res.json({ whitelisted: false });
  res.json({
    whitelisted: user.uuid ? isWhitelisted(user.uuid) : false,
    uuid: user.uuid || null,
    enabled: user.enabled !== false,
  });
});

// Manual whitelist sync
router.post('/whitelist/sync', auth, requirePerm('users.manage'), (req, res) => {
  syncWhitelist();
  res.json({ success: true, message: 'Whitelist synchronisiert' });
});

module.exports = router;
