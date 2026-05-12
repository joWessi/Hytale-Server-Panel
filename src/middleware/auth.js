// JWT authentication via httpOnly cookies + sliding session
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getUserByUsername, getUserPermissions } = require('../data/users');

function cookieOpts() {
  return {
    ...config.COOKIE_OPTS_BASE,
    secure: process.env.NODE_ENV === 'production',
    maxAge: config.JWT_EXPIRY_SEC * 1000,
  };
}

function signToken(user) {
  return jwt.sign(
    { username: user.username, role: user.role, tokenVersion: user.tokenVersion || 0 },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRY_SEC }
  );
}

function issueSessionCookie(res, user) {
  res.cookie(config.COOKIE_NAME, signToken(user), cookieOpts());
}

function clearSessionCookie(res) {
  res.clearCookie(config.COOKIE_NAME, {
    ...config.COOKIE_OPTS_BASE,
    secure: process.env.NODE_ENV === 'production',
  });
}

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

    if ((payload.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ error: 'Token ungueltig' });
    }

    req.user = {
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
      permissions: getUserPermissions(user),
      mustChangePassword: !!user.mustChangePassword,
    };

    // Sliding session: re-issue cookie if token is older than half its lifetime
    const issuedAt = payload.iat * 1000;
    const halfLife = (config.JWT_EXPIRY_SEC * 1000) / 2;
    if (Date.now() - issuedAt > halfLife) {
      issueSessionCookie(res, user);
    }

    next();
  } catch {
    res.status(401).json({ error: 'Token ungueltig' });
  }
}

function requirePerm(permission) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (!(req.user.permissions || []).includes(permission)) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    next();
  };
}

module.exports = {
  auth, requirePerm,
  issueSessionCookie, clearSessionCookie, signToken,
};
