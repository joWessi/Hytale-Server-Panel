// Security middleware: rate limiting, helmet, command sanitization
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const config = require('../config');

function mkLimiter(opts, msg) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    message: { error: msg },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

const loginLimiter = mkLimiter(config.LOGIN_RATE_LIMIT, 'Zu viele Login-Versuche. Bitte spaeter erneut versuchen.');
const apiLimiter = mkLimiter(config.API_RATE_LIMIT, 'Zu viele Anfragen. Bitte spaeter erneut versuchen.');
const uploadLimiter = mkLimiter(config.UPLOAD_RATE_LIMIT, 'Zu viele Uploads. Bitte warten.');
const downloadLimiter = mkLimiter(config.DOWNLOAD_RATE_LIMIT, 'Zu viele Downloads. Bitte warten.');

const helmetMiddleware = helmet({
  contentSecurityPolicy: false, // Handled by Nginx
  crossOriginEmbedderPolicy: false,
});

const COMMAND_PATTERN = /^[a-zA-Z0-9\s\-_.,!?:;=@#/'"()\[\]{}+*<>äöüÄÖÜß]+$/;

function sanitizeCommand(cmd) {
  if (typeof cmd !== 'string') return null;
  const trimmed = cmd.trim().slice(0, config.MAX_COMMAND_LENGTH);
  if (!trimmed) return null;
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return null;
  if (/[`$\\|;&]/.test(trimmed)) return null;
  if (!COMMAND_PATTERN.test(trimmed)) return null;
  return trimmed;
}

module.exports = {
  loginLimiter, apiLimiter, uploadLimiter, downloadLimiter,
  helmetMiddleware, sanitizeCommand,
};
