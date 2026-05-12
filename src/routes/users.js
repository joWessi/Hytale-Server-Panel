// User management routes
const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { getUsers, saveUsers, getUserPermissions } = require('../data/users');
const { logActivity } = require('../data/store');
const { syncWhitelist, isValidUuid } = require('../services/whitelist');

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
  const { username, password, role, permissions } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
  }
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'Benutzername: 3-32 Zeichen (a-z, 0-9, _-)' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });
  }

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
    mustChangePassword: false,
  });
  saveUsers(users);
  logActivity(req.user.username, `Benutzer erstellt: ${username}`);
  res.json({ success: true });
});

router.patch('/users/:username', auth, requirePerm('users.manage'), (req, res) => {
  const users = getUsers();
  const user = users.find(u => u.username === req.params.username);
  if (!user) return res.status(404).json({ error: 'Nicht gefunden' });

  const isAdminAccount = user.username === 'admin';
  let needsTokenBump = false;
  let needsWhitelistSync = false;

  // Role/permission changes blocked for built-in admin account
  if (!isAdminAccount && req.body.role && req.body.role !== user.role) {
    user.role = req.body.role === 'admin' ? 'admin' : 'user';
    if (user.role === 'admin') user.permissions = [];
    needsTokenBump = true;
  }

  if (!isAdminAccount && user.role !== 'admin' && Array.isArray(req.body.permissions)) {
    const filtered = req.body.permissions.filter(p => config.ALL_PERMISSIONS.includes(p));
    if (JSON.stringify(filtered.slice().sort()) !== JSON.stringify((user.permissions || []).slice().sort())) {
      user.permissions = filtered;
      needsTokenBump = true;
    }
  }

  if (typeof req.body.uuid === 'string') {
    const newUuid = req.body.uuid.trim() || null;
    if (newUuid && !isValidUuid(newUuid)) {
      return res.status(400).json({ error: 'Ungueltige UUID' });
    }
    if (newUuid) {
      const taken = users.some(u => u.username !== user.username && u.uuid && u.uuid.toLowerCase() === newUuid.toLowerCase());
      if (taken) return res.status(400).json({ error: 'UUID wird bereits von einem anderen Benutzer verwendet' });
    }
    if (newUuid !== user.uuid) {
      user.uuid = newUuid;
      needsWhitelistSync = true;
    }
  }

  if (!isAdminAccount && typeof req.body.enabled === 'boolean' && req.body.enabled !== (user.enabled !== false)) {
    user.enabled = req.body.enabled;
    needsTokenBump = true;
    needsWhitelistSync = true;
  }

  if (needsTokenBump) user.tokenVersion = (user.tokenVersion || 0) + 1;
  saveUsers(users);
  if (needsWhitelistSync) syncWhitelist();
  logActivity(req.user.username, `Benutzer aktualisiert: ${user.username}`);
  res.json({ success: true });
});

router.post('/users/:username/reset-password', auth, requirePerm('users.manage'), (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });
  }
  const users = getUsers();
  const user = users.find(u => u.username === req.params.username);
  if (!user) return res.status(404).json({ error: 'Nicht gefunden' });
  if (user.username === req.user.username) {
    return res.status(400).json({ error: 'Eigenes Passwort ueber Profil aendern' });
  }
  user.passwordHash = bcrypt.hashSync(newPassword, config.BCRYPT_ROUNDS);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.mustChangePassword = true;
  saveUsers(users);
  logActivity(req.user.username, `Passwort zurueckgesetzt: ${user.username}`);
  res.json({ success: true });
});

router.delete('/users/:username', auth, requirePerm('users.manage'), (req, res) => {
  if (req.params.username === 'admin') {
    return res.status(400).json({ error: 'Admin kann nicht geloescht werden' });
  }
  if (req.params.username === req.user.username) {
    return res.status(400).json({ error: 'Selbstloeschung nicht erlaubt' });
  }
  const users = getUsers();
  const remaining = users.filter(u => u.username !== req.params.username);
  saveUsers(remaining);
  syncWhitelist();
  logActivity(req.user.username, `Benutzer geloescht: ${req.params.username}`);
  res.json({ success: true });
});

router.get('/users/me/whitelist', auth, (req, res) => {
  const users = getUsers();
  const user = users.find(u => u.username === req.user.username);
  if (!user) return res.json({ whitelisted: false });
  const { isWhitelisted } = require('../services/whitelist');
  res.json({
    whitelisted: user.uuid ? isWhitelisted(user.uuid) : false,
    uuid: user.uuid || null,
    enabled: user.enabled !== false,
  });
});

module.exports = router;
