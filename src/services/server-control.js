// Server process control: status checks, script execution, FIFO interaction
const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const config = require('../config');

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const EXEC_OPTS = { timeout: 5000, maxBuffer: 1024 * 1024 };

async function isServerActive() {
  try {
    await execAsync('sudo systemctl is-active --quiet hytale-server', EXEC_OPTS);
    return true;
  } catch {
    return false;
  }
}

async function isServerRunning() {
  try {
    const result = await execAsync('pgrep -f HytaleServer.jar', EXEC_OPTS);
    return (result.stdout || '').trim().length > 0;
  } catch {
    return false;
  }
}

async function getServerPid() {
  try {
    const result = await execAsync('pgrep -f -o HytaleServer.jar', EXEC_OPTS);
    return (result.stdout || '').trim();
  } catch {
    return '';
  }
}

async function getServerUptimeSeconds() {
  const pid = await getServerPid();
  if (!pid) return 0;
  try {
    const result = await execAsync(`ps -o etimes= -p ${pid}`, EXEC_OPTS);
    return parseInt((result.stdout || '').trim(), 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Run a shell script via bash with arguments and timeout.
 */
async function runScript(scriptPath, args = [], timeoutMs = 10000) {
  return execFileAsync(config.SCRIPT_SHELL, [scriptPath, ...args], {
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
}

/**
 * Execute a systemctl command (via sudo for non-root panel user).
 */
async function systemctl(action) {
  return execAsync(`sudo systemctl ${action} hytale-server`, {
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
}

// Player count cache
let cachedPlayers = 0;
let lastPlayersAt = 0;
let playersRefreshInFlight = false;

async function refreshPlayersIfStale() {
  if (playersRefreshInFlight) return;
  const now = Date.now();
  if (now - lastPlayersAt < config.PLAYERS_CACHE_MS) return;
  playersRefreshInFlight = true;
  try {
    const result = await runScript(config.GET_PLAYERS_SCRIPT, [], 3000);
    cachedPlayers = parseInt((result.stdout || '').trim(), 10) || 0;
    lastPlayersAt = Date.now();
  } catch { /* keep cached value */ }
  finally { playersRefreshInFlight = false; }
}

function getCachedPlayers() {
  return cachedPlayers;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  isServerActive, isServerRunning, getServerPid, getServerUptimeSeconds,
  runScript, systemctl, refreshPlayersIfStale, getCachedPlayers, delay,
};
