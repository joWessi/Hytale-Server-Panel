// System metrics: CPU, RAM, disk
const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { auth } = require('../middleware/auth');
const { getMemoryStats, getCpuPercent } = require('../services/metrics');

const execFileAsync = promisify(execFile);

const router = express.Router();

async function getDisk() {
  try {
    const { stdout } = await execFileAsync('df', ['-h', '/'], { timeout: 5000 });
    const parts = stdout.trim().split('\n').pop().split(/\s+/);
    return {
      total: parts[1] || '0',
      used: parts[2] || '0',
      percent: parseInt(parts[4], 10) || 0,
    };
  } catch {
    return { total: '0', used: '0', percent: 0 };
  }
}

router.get('/system', auth, async (req, res) => {
  const [cpu, mem] = await Promise.all([getCpuPercent(), Promise.resolve(getMemoryStats())]);
  res.json({ cpu, ...mem });
});

router.get('/disk', auth, async (req, res) => {
  res.json(await getDisk());
});

module.exports = router;
module.exports.getDisk = getDisk;
