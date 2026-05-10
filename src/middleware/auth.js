// JWT authentication middleware using httpOnly cookies
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getUserByUsername, getUserPermissions } = require('../data/users');

/**
 * Authenticate request via httpOnly cookie or Authorization header (fallback).
 */
function auth(req, res, next) {
  const token = req.cookies?.[config.COOKIE_NAME]
    || req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Nicht authentifiziert' });

  try {
    const payload = jwt.verify(token, config.JWT_SECRET);
    const user = getUserByUsername(payload.username);

    if (!user || user.enabled === false) {
      return res.status(401).json({ error: 'Zugang gesperrt' });
    }

    const tokenVersion = payload.tokenVersion || 0;
    const currentVersion = user.tokenVersion || 0;
    if (tokenVersion !== currentVersion) {
      return res.status(401).json({ error: 'Token ungueltig' });
    }

    req.user = {
      username: user.username,
      role: user.role,
      tokenVersion: currentVersion,
      permissions: getUserPermissions(user),
    };
    next();
  } catch {
    res.status(401).json({ error: 'Token ungueltig' });
  }
}

/**
 * Require specific role(s).
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Keine Berechtigung' });
    next();
  };
}

/**
 * Require a specific permission (admin always passes).
 */
function requirePerm(permission) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (!(req.user.permissions || []).includes(permission)) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    next();
  };
}

module.exports = { auth, requireRole, requirePerm };
