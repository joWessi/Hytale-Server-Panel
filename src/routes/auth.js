// Authentication routes
const express = require('express');
const bcrypt = require('bcryptjs');
const { getUserByUsername, getUserPermissions, setPassword } = require('../data/users');
const { getSettings } = require('../data/settings');
const { auth, issueSessionCookie, clearSessionCookie } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/security');
const { logActivity } = require('../data/store');

const router = express.Router();

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
  }

  const user = getUserByUsername(username);
  if (!user || user.enabled === false || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Ungueltige Anmeldedaten' });
  }

  issueSessionCookie(res, user);
  logActivity(username, 'Login');

  const settings = getSettings();
  res.json({
    role: user.role,
    permissions: getUserPermissions(user),
    sessionTimeout: settings.sessionTimeout,
    mustChangePassword: !!user.mustChangePassword,
  });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

router.get('/users/me', auth, (req, res) => {
  const settings = getSettings();
  res.json({
    username: req.user.username,
    role: req.user.role,
    permissions: req.user.permissions,
    sessionTimeout: settings.sessionTimeout,
    mustChangePassword: req.user.mustChangePassword,
  });
});

router.post('/users/me/password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Beide Felder erforderlich' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });
  }
  const user = getUserByUsername(req.user.username);
  if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
  }
  setPassword(user.username, newPassword);
  logActivity(user.username, 'Passwort geaendert');
  clearSessionCookie(res);
  res.json({ success: true });
});

module.exports = router;
