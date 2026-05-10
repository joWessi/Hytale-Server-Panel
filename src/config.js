// Central configuration - paths, constants, environment loading
const path = require('path');

// Require JWT_SECRET - refuse to start without it
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required.');
  console.error('Generate one with: openssl rand -base64 48');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = parseInt(process.env.PORT, 10) || 3000;
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';

// Discord webhook from environment (never exposed to frontend)
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK || '';

// Directories
const DATA_DIR = path.join(__dirname, '..', 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const SERVER_DIR = process.env.SERVER_DIR || '/home/hytale/server';
const ASSETS_DIR = process.env.ASSETS_DIR || '/home/hytale/HytaleAssets';

// Data files
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SCHEDULER_FILE = path.join(DATA_DIR, 'scheduler.json');
const ACTIVITY_LOG = path.join(DATA_DIR, 'activity.log');
const WHITELIST_FILE = path.join(DATA_DIR, 'whitelist.json');
const UPDATE_STATUS_FILE = path.join(DATA_DIR, 'update_status.json');
const VERSION_FILE = path.join(DATA_DIR, 'current_version.txt');
const HASH_FILE = path.join(DATA_DIR, 'installed_hashes.json');

// Gameserver paths
const GAMESERVER_WHITELIST = path.join(SERVER_DIR, 'whitelist.json');
const SERVER_JAR = path.join(SERVER_DIR, 'HytaleServer.jar');
const CONSOLE_LOG = path.join(SERVER_DIR, 'logs', 'console.log');

// Scripts
const SCRIPT_SHELL = '/bin/bash';
const STOP_SCRIPT = '/usr/local/bin/hytale-stop.sh';
const UPDATE_SCRIPT = '/usr/local/bin/hytale-update.sh';
const SEND_CMD_SCRIPT = path.join(SERVER_DIR, 'send_cmd.sh');
const SEND_SAVE_SCRIPT = path.join(SERVER_DIR, 'send_save.sh');
const GET_PLAYERS_SCRIPT = path.join(SERVER_DIR, 'get_players.sh');

// Limits
const MAX_BACKUPS = 3;
const MAX_UPLOAD_SIZE = 500 * 1024 * 1024; // 500 MB
const MAX_COMMAND_LENGTH = 200;
const ACTIVITY_LOG_MAX_LINES = 10000;

// Monitoring
const PLAYERS_CACHE_MS = 30000;
const MEM_ALERT_THRESHOLD = 90;
const MEM_ALERT_INTERVAL_MS = 5 * 60 * 1000;

// Auth
const JWT_EXPIRY = '24h';
const COOKIE_NAME = 'hytale_session';
const BCRYPT_ROUNDS = 12;

// Rate limiting
const LOGIN_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 5 };
const API_RATE_LIMIT = { windowMs: 60 * 1000, max: 100 };

// Allowed config file extensions
const CONFIG_EXTENSIONS = ['.properties', '.yml', '.yaml', '.json', '.txt', '.cfg', '.conf', '.toml'];

// All available permissions
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

// Default panel settings
const DEFAULT_SETTINGS = {
  serverAddress: 'play.dirt.haus',
  serverPort: 5520,
  sessionTimeout: 30,
  panelName: 'Hytale Panel',
  accentColor: '#22C55E',
  cardColor: '#1e293b',
  bgColor: '#0f172a',
  hidePanelName: false,
};

// Default scheduler config
const DEFAULT_SCHEDULER = {
  autoRestart: false,
  restartTime: '04:00',
  autoBackup: false,
  backupTime: '03:00',
  lastRestart: null,
  lastBackup: null,
};

module.exports = {
  JWT_SECRET, PORT, BIND_HOST, DISCORD_WEBHOOK_URL,
  DATA_DIR, BACKUPS_DIR, SERVER_DIR, ASSETS_DIR,
  USERS_FILE, SETTINGS_FILE, SCHEDULER_FILE, ACTIVITY_LOG, WHITELIST_FILE,
  UPDATE_STATUS_FILE, VERSION_FILE, HASH_FILE,
  GAMESERVER_WHITELIST, SERVER_JAR, CONSOLE_LOG,
  SCRIPT_SHELL, STOP_SCRIPT, UPDATE_SCRIPT,
  SEND_CMD_SCRIPT, SEND_SAVE_SCRIPT, GET_PLAYERS_SCRIPT,
  MAX_BACKUPS, MAX_UPLOAD_SIZE, MAX_COMMAND_LENGTH, ACTIVITY_LOG_MAX_LINES,
  PLAYERS_CACHE_MS, MEM_ALERT_THRESHOLD, MEM_ALERT_INTERVAL_MS,
  JWT_EXPIRY, COOKIE_NAME, BCRYPT_ROUNDS,
  LOGIN_RATE_LIMIT, API_RATE_LIMIT,
  CONFIG_EXTENSIONS, ALL_PERMISSIONS, DEFAULT_SETTINGS, DEFAULT_SCHEDULER,
};
