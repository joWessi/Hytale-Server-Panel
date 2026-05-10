// Authentication routes: login, logout, current user
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { getUsers, getUserPermissions } = require('../data/users');
const { getSettings } = require('../data/settings');
const { auth } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/security');
const { logActivity } = require('../data/store');

const router = express.Router();

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
  }

  const users = getUsers();
  const user = users.find(u => u.username === username);

  if (!user || user.enabled === false || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Ungueltige Anmeldedaten' });
  }

  const tokenVersion = user.tokenVersion || 0;
  const perms = getUserPermissions(user);
  const settings = getSettings();
  const token = jwt.sign(
    { username: user.username, role: user.role, tokenVersion },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRY }
  );

  // Set httpOnly cookie
  res.cookie(config.COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24h
    path: '/',
  });

  logActivity(username, 'Login');
  res.json({ role: user.role, permissions: perms, sessionTimeout: settings.sessionTimeout });
});

router.post('/logout', (req, res) => {
  res.clearCookie(config.COOKIE_NAME, { path: '/' });
  res.json({ success: true });
});

router.get('/users/me', auth, (req, res) => {
  const settings = getSettings();
  res.json({
    username: req.user.username,
    role: req.user.role,
    permissions: req.user.permissions,
    sessionTimeout: settings.sessionTimeout,
  });
});

module.exports = router;
