// Scheduler routes
const express = require('express');
const { auth, requirePerm } = require('../middleware/auth');
const { getScheduler, saveScheduler } = require('../data/settings');
const { scheduleJobs } = require('../services/scheduler');
const { logActivity } = require('../data/store');

const router = express.Router();

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

router.get('/scheduler', auth, requirePerm('scheduler.manage'), (req, res) => {
  res.json(getScheduler());
});

router.post('/scheduler', auth, requirePerm('scheduler.manage'), (req, res) => {
  const scheduler = getScheduler();
  const b = req.body || {};
  scheduler.autoRestart = !!b.autoRestart;
  scheduler.autoBackup = !!b.autoBackup;
  if (TIME_RE.test(b.restartTime)) scheduler.restartTime = b.restartTime;
  if (TIME_RE.test(b.backupTime)) scheduler.backupTime = b.backupTime;
  if (b.restartWarnMinutes !== undefined) {
    const mins = parseInt(b.restartWarnMinutes, 10);
    if (Number.isFinite(mins) && mins >= 1 && mins <= 30) {
      scheduler.restartWarnMinutes = mins;
    }
  }
  saveScheduler(scheduler);
  scheduleJobs();
  logActivity(req.user.username, 'Scheduler aktualisiert');
  res.json({ success: true });
});

module.exports = router;
