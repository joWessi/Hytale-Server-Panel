// Cookie-based auth for WebSocket upgrade requests.
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getUserByUsername, getUserPermissions } = require('../data/users');

function parseCookies(cookieStr) {
  const cookies = {};
  (cookieStr || '').split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=');
    if (k) cookies[k] = decodeURIComponent(v.join('='));
  });
  return cookies;
}

function authedUser(req) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies[config.COOKIE_NAME];
    if (!token) return null;
    const payload = jwt.verify(token, config.JWT_SECRET);
    const user = getUserByUsername(payload.username);
    if (!user || user.enabled === false) return null;
    if ((payload.tokenVersion || 0) !== (user.tokenVersion || 0)) return null;
    return {
      username: user.username,
      role: user.role,
      permissions: getUserPermissions(user),
    };
  } catch {
    return null;
  }
}

module.exports = { authedUser, parseCookies };
