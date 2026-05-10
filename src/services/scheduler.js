// Persistent scheduler using node-cron (survives panel restarts)
const cron = require('node-cron');
const config = require('../config');
const { getScheduler, saveScheduler } = require('../data/settings');
const { logActivity } = require('../data/store');
const { isServerActive, runScript, delay } = require('./server-control');
const { createBackup } = require('./backup');
const { sendDiscord } = require('./discord');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');

const execAsync = promisify(exec);

let restartJob = null;
let backupJob = null;

/**
 * (Re)schedule auto-restart and auto-backup based on current scheduler config.
 */
function scheduleJobs() {
  if (restartJob) { restartJob.stop(); restartJob = null; }
  if (backupJob) { backupJob.stop(); backupJob = null; }

  const scheduler = getScheduler();

  if (scheduler.autoRestart && scheduler.restartTime) {
    const [h, m] = scheduler.restartTime.split(':').map(Number);
    restartJob = cron.schedule(`${m} ${h} * * *`, () => executeRestart());
  }

  if (scheduler.autoBackup && scheduler.backupTime) {
    const [h, m] = scheduler.backupTime.split(':').map(Number);
    backupJob = cron.schedule(`${m} ${h} * * *`, () => executeAutoBackup());
  }
}

async function executeRestart() {
  try {
    const running = await isServerActive();
    if (!running) return;

    await runScript(config.SEND_CMD_SCRIPT, ['say Server-Neustart in 1 Minute!'], 5000).catch(() => {});
    await delay(60000);
    await runScript(config.SEND_SAVE_SCRIPT, [], 5000).catch(() => {});

    fs.writeFileSync('/tmp/hytale-planned-restart', '');
    await execAsync('sudo systemctl restart hytale-server', { timeout: 30000 });

    const s = getScheduler();
    s.lastRestart = new Date().toISOString();
    saveScheduler(s);
    sendDiscord('Auto-Restart ausgefuehrt', 15105570);
    logActivity('system', 'Auto-Restart ausgefuehrt');
  } catch (e) {
    logActivity('system', `Auto-Restart fehlgeschlagen: ${e.message}`);
  }
}

async function executeAutoBackup() {
  try {
    const running = await isServerActive();
    const result = await createBackup(running);

    if (result.success) {
      const s = getScheduler();
      s.lastBackup = new Date().toISOString();
      saveScheduler(s);
      sendDiscord(`Auto-Backup erstellt: ${result.name}`, 3066993);
      logActivity('system', `Auto-Backup erstellt: ${result.name}`);
    } else {
      logActivity('system', `Auto-Backup fehlgeschlagen: ${result.message}`);
    }
  } catch (e) {
    logActivity('system', `Auto-Backup fehlgeschlagen: ${e.message}`);
  }
}

/**
 * On startup, check if a scheduled job was missed while the panel was down.
 */
function checkMissedJobs() {
  const scheduler = getScheduler();
  const now = new Date();

  if (scheduler.autoRestart && scheduler.lastRestart) {
    const last = new Date(scheduler.lastRestart);
    const hoursSince = (now - last) / (1000 * 60 * 60);
    if (hoursSince > 25) {
      logActivity('system', 'Verpasster Auto-Restart erkannt (Panel war offline)');
    }
  }

  if (scheduler.autoBackup && scheduler.lastBackup) {
    const last = new Date(scheduler.lastBackup);
    const hoursSince = (now - last) / (1000 * 60 * 60);
    if (hoursSince > 25) {
      logActivity('system', 'Verpasstes Auto-Backup erkannt, wird jetzt ausgefuehrt');
      executeAutoBackup();
    }
  }
}

module.exports = { scheduleJobs, checkMissedJobs };
