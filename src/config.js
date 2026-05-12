// Central configuration - paths, constants, environment loading
const path = require('path');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required.');
  console.error('Generate one with: openssl rand -base64 48');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = parseInt(process.env.PORT, 10) || 3000;
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK || '';

// Shared secret for crash-notify script -> /api/internal/crash
const CRASH_NOTIFY_TOKEN = process.env.CRASH_NOTIFY_TOKEN || '';

// Directories
const DATA_DIR = path.join(__dirname, '..', 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const METRICS_DIR = path.join(DATA_DIR, 'metrics');
const SERVER_DIR = process.env.SERVER_DIR || '/home/hytale/server';
const ASSETS_DIR = process.env.ASSETS_DIR || '/home/hytale/HytaleAssets';

// Data files
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SCHEDULER_FILE = path.join(DATA_DIR, 'scheduler.json');
const ACTIVITY_LOG = path.join(DATA_DIR, 'activity.log');
const WHITELIST_FILE = path.join(DATA_DIR, 'whitelist.json');
const CRASH_STATS_FILE = path.join(DATA_DIR, 'crash-stats.json');

// Gameserver paths
const GAMESERVER_WHITELIST = path.join(SERVER_DIR, 'whitelist.json');
const SERVER_JAR = path.join(SERVER_DIR, 'HytaleServer.jar');
const CONSOLE_LOG = path.join(SERVER_DIR, 'logs', 'console.log');

// Scripts
const SCRIPT_SHELL = '/bin/bash';
const STOP_SCRIPT = '/usr/local/bin/hytale-stop.sh';
const SEND_CMD_SCRIPT = path.join(SERVER_DIR, 'send_cmd.sh');
const SEND_SAVE_SCRIPT = path.join(SERVER_DIR, 'send_save.sh');
const GET_PLAYERS_SCRIPT = path.join(SERVER_DIR, 'get_players.sh');

// Upload temp dir (PrivateTmp=true makes /tmp private to the service)
const UPLOAD_TMP = '/tmp/hytale-uploads';

// Limits / Tuning
const DEFAULT_MAX_BACKUPS = 3;
const MAX_UPLOAD_SIZE = 500 * 1024 * 1024;
const MAX_COMMAND_LENGTH = 200;
const ACTIVITY_LOG_MAX_LINES = 10000;
const METRICS_HISTORY_HOURS = 24;
const METRICS_SAMPLE_MS = 60 * 1000;

const PLAYERS_CACHE_MS = 30000;
const MEM_ALERT_THRESHOLD = 90;
const MEM_ALERT_INTERVAL_MS = 5 * 60 * 1000;

// Crash-loop detection
const CRASH_LOOP_THRESHOLD = 3;
const CRASH_LOOP_WINDOW_MS = 10 * 60 * 1000;

// Auth
const JWT_EXPIRY_SEC = 24 * 60 * 60;
const COOKIE_NAME = 'hytale_session';
const COOKIE_OPTS_BASE = {
  httpOnly: true,
  sameSite: 'strict',
  path: '/',
};
const BCRYPT_ROUNDS = 12;

// Rate limiting
const LOGIN_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 5 };
const API_RATE_LIMIT = { windowMs: 60 * 1000, max: 200 };
const UPLOAD_RATE_LIMIT = { windowMs: 60 * 1000, max: 10 };
const DOWNLOAD_RATE_LIMIT = { windowMs: 60 * 1000, max: 20 };

// Editable text-file extensions (used by config + files editor)
const TEXT_EXTENSIONS = ['.properties', '.yml', '.yaml', '.json', '.txt', '.cfg', '.conf', '.toml', '.log', '.md', '.ini', '.xml', '.csv'];

const ALL_PERMISSIONS = [
  'server.control',
  'console.read', 'console.write',
  'files.read', 'files.write',
  'config.read', 'config.write',
  'backups.read', 'backups.manage',
  'scheduler.manage',
  'users.manage',
  'settings.manage',
];

const DEFAULT_SETTINGS = {
  serverAddress: 'play.dirt.haus',
  serverPort: 5520,
  sessionTimeout: 30,
  panelName: 'Hytale Panel',
  accentColor: '#22C55E',
  cardColor: '#1e293b',
  bgColor: '#0f172a',
  hidePanelName: false,
  maxBackups: 3,
  backupRetention: 'fifo', // 'fifo' | 'gfs' (grandfather-father-son: 7 daily + 4 weekly + 6 monthly)
};

const DEFAULT_SCHEDULER = {
  autoRestart: false,
  restartTime: '04:00',
  autoBackup: false,
  backupTime: '03:00',
  restartWarnMinutes: 5,
  lastRestart: null,
  lastBackup: null,
};

module.exports = {
  JWT_SECRET, PORT, BIND_HOST, DISCORD_WEBHOOK_URL, CRASH_NOTIFY_TOKEN,
  DATA_DIR, BACKUPS_DIR, METRICS_DIR, SERVER_DIR, ASSETS_DIR,
  USERS_FILE, SETTINGS_FILE, SCHEDULER_FILE, ACTIVITY_LOG, WHITELIST_FILE, CRASH_STATS_FILE,
  GAMESERVER_WHITELIST, SERVER_JAR, CONSOLE_LOG,
  SCRIPT_SHELL, STOP_SCRIPT,
  SEND_CMD_SCRIPT, SEND_SAVE_SCRIPT, GET_PLAYERS_SCRIPT,
  UPLOAD_TMP,
  DEFAULT_MAX_BACKUPS, MAX_UPLOAD_SIZE, MAX_COMMAND_LENGTH, ACTIVITY_LOG_MAX_LINES,
  METRICS_HISTORY_HOURS, METRICS_SAMPLE_MS,
  PLAYERS_CACHE_MS, MEM_ALERT_THRESHOLD, MEM_ALERT_INTERVAL_MS,
  CRASH_LOOP_THRESHOLD, CRASH_LOOP_WINDOW_MS,
  JWT_EXPIRY_SEC, COOKIE_NAME, COOKIE_OPTS_BASE, BCRYPT_ROUNDS,
  LOGIN_RATE_LIMIT, API_RATE_LIMIT, UPLOAD_RATE_LIMIT, DOWNLOAD_RATE_LIMIT,
  TEXT_EXTENSIONS, ALL_PERMISSIONS, DEFAULT_SETTINGS, DEFAULT_SCHEDULER,
};
