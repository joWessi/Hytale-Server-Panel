// System monitoring routes: CPU, RAM, disk usage
const express = require('express');
const { exec } = require('child_process');
const { auth } = require('../middleware/auth');
const { getMemoryPercent } = require('../services/metrics');
const fs = require('fs');

const router = express.Router();

router.get('/system', auth, (req, res) => {
  exec("LC_ALL=C top -bn1 | grep 'Cpu(s)' | awk -F'[, ]+' '{print 100-$8}'",
    { timeout: 5000 },
    (cpuErr, cpuOut) => {
      // Read memory from /proc/meminfo directly (no shell needed)
      let memUsed = 0, memTotal = 0, memPercent = 0;
      try {
        const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
        let total = 0, available = 0;
        for (const line of meminfo.split('\n')) {
          if (line.startsWith('MemTotal:')) total = parseInt(line.replace(/\D+/g, ''), 10);
          if (line.startsWith('MemAvailable:')) available = parseInt(line.replace(/\D+/g, ''), 10);
        }
        memTotal = Math.round(total / 1024);
        memUsed = Math.round((total - available) / 1024);
        memPercent = total ? Math.round((1 - available / total) * 100) : 0;
      } catch { /* ignore */ }

      res.json({
        cpu: Math.round(parseFloat(cpuOut) || 0),
        memUsed,
        memTotal,
        memPercent,
      });
    }
  );
});

router.get('/disk', auth, (req, res) => {
  exec("df -h / | tail -1 | awk '{print $2,$3,$5}'", { timeout: 5000 }, (err, stdout) => {
    if (err) return res.json({ percent: 0, used: '0', total: '0' });
    const parts = stdout.trim().split(' ');
    res.json({
      percent: parseInt(parts[2], 10) || 0,
      used: parts[1] || '0',
      total: parts[0] || '0',
    });
  });
});

module.exports = router;
