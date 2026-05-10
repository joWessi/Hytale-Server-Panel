// Security middleware: rate limiting, helmet, command sanitization
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const config = require('../config');

/**
 * Rate limiter for login endpoint: 5 attempts per 15 minutes per IP.
 */
const loginLimiter = rateLimit({
  windowMs: config.LOGIN_RATE_LIMIT.windowMs,
  max: config.LOGIN_RATE_LIMIT.max,
  message: { error: 'Zu viele Login-Versuche. Bitte spaeter erneut versuchen.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Global rate limiter: 100 requests per minute per IP.
 */
const apiLimiter = rateLimit({
  windowMs: config.API_RATE_LIMIT.windowMs,
  max: config.API_RATE_LIMIT.max,
  message: { error: 'Zu viele Anfragen. Bitte spaeter erneut versuchen.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Helmet for basic security headers.
 * CSP is primarily handled by Nginx, but we set sensible defaults.
 */
const helmetMiddleware = helmet({
  contentSecurityPolicy: false, // Handled by Nginx for more control
  crossOriginEmbedderPolicy: false,
});

// Allowed characters for console commands sent to FIFO
const COMMAND_PATTERN = /^[a-zA-Z0-9\s\-_.,!?:;=@#/'"()\[\]{}+*<>äöüÄÖÜß]+$/;

/**
 * Sanitize a console command before sending to FIFO.
 * Returns sanitized command or null if invalid.
 */
function sanitizeCommand(cmd) {
  if (typeof cmd !== 'string') return null;
  const trimmed = cmd.trim().slice(0, config.MAX_COMMAND_LENGTH);
  if (!trimmed) return null;

  // Reject control characters and newlines
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return null;

  // Reject shell metacharacters that could cause issues
  if (/[`$\\|;&]/.test(trimmed)) return null;

  return trimmed;
}

module.exports = { loginLimiter, apiLimiter, helmetMiddleware, sanitizeCommand };
