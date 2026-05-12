// Persistent scheduler using node-cron
const cron = require('node-cron');
const fs = require('fs');
const config = require('../config');
const { getScheduler, saveScheduler } = require('../data/settings');
const { logActivity } = require('../data/store');
const { isServerActive, runScript, systemctl, delay } = require('./server-control');
const { createBackup } = require('./backup');
const { sendDiscord } = require('./discord');
const { markPlannedRestart } = require('./planned-restart');

let restartJob = null;
let backupJob = null;

function scheduleJobs() {
  restartJob?.stop(); restartJob = null;
  backupJob?.stop(); backupJob = null;

  const scheduler = getScheduler();

  if (scheduler.autoRestart && scheduler.restartTime) {
    const [h, m] = scheduler.restartTime.split(':').map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      restartJob = cron.schedule(`${m} ${h} * * *`, () => executeRestart());
    }
  }

  if (scheduler.autoBackup && scheduler.backupTime) {
    const [h, m] = scheduler.backupTime.split(':').map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      backupJob = cron.schedule(`${m} ${h} * * *`, () => executeAutoBackup());
    }
  }
}

async function executeRestart() {
  try {
    if (!(await isServerActive())) return;

    const scheduler = getScheduler();
    const warnMin = Math.max(1, Math.min(30, parseInt(scheduler.restartWarnMinutes, 10) || 5));

    for (let mins = warnMin; mins > 0; mins--) {
      if (mins === warnMin || mins === 1 || mins === 5 || mins === 10) {
        await runScript(config.SEND_CMD_SCRIPT,
          [`say Server-Neustart in ${mins} ${mins === 1 ? 'Minute' : 'Minuten'}!`],
          5000).catch(() => {});
      }
      await delay(60000);
    }

    markPlannedRestart();
    await systemctl('restart').catch(() => {});

    const s = getScheduler();
    s.lastRestart = new Date().toISOString();
    saveScheduler(s);
    sendDiscord('Auto-Restart ausgeführt', 15105570);
    logActivity('system', 'Auto-Restart ausgeführt');
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

function checkMissedJobs() {
  const scheduler = getScheduler();
  const now = new Date();

  if (scheduler.autoRestart && scheduler.lastRestart) {
    const hoursSince = (now - new Date(scheduler.lastRestart)) / 3600000;
    if (hoursSince > 25) logActivity('system', 'Verpasster Auto-Restart erkannt (Panel war offline)');
  }
  if (scheduler.autoBackup && scheduler.lastBackup) {
    const hoursSince = (now - new Date(scheduler.lastBackup)) / 3600000;
    if (hoursSince > 25) {
      logActivity('system', 'Verpasstes Auto-Backup erkannt, wird jetzt ausgeführt');
      executeAutoBackup();
    }
  }
}

module.exports = { scheduleJobs, checkMissedJobs, executeRestart, executeAutoBackup };
