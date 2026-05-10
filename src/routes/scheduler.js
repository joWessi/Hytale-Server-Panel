// Scheduler routes: get/set auto-restart and auto-backup config
const express = require('express');
const { auth, requirePerm } = require('../middleware/auth');
const { getScheduler, saveScheduler } = require('../data/settings');
const { scheduleJobs } = require('../services/scheduler');
const { logActivity } = require('../data/store');

const router = express.Router();

router.get('/scheduler', auth, requirePerm('scheduler.manage'), (req, res) => {
  res.json(getScheduler());
});

router.post('/scheduler', auth, requirePerm('scheduler.manage'), (req, res) => {
  const scheduler = getScheduler();
  scheduler.autoRestart = !!req.body.autoRestart;
  scheduler.restartTime = req.body.restartTime || '04:00';
  scheduler.autoBackup = !!req.body.autoBackup;
  scheduler.backupTime = req.body.backupTime || '03:00';
  saveScheduler(scheduler);
  scheduleJobs();
  logActivity(req.user.username, 'Scheduler aktualisiert');
  res.json({ success: true });
});

module.exports = router;
