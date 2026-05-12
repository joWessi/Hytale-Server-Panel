// Online players + actions (kick/ban/op)
const express = require('express');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { runScript, isServerActive } = require('../services/server-control');
const { sanitizeCommand } = require('../middleware/security');
const { logActivity } = require('../data/store');
const { getOnline } = require('../services/player-tracker');

const router = express.Router();

router.get('/players', auth, async (req, res) => {
  const running = await isServerActive();
  if (!running) return res.json({ running: false, players: [] });
  res.json({ running: true, players: getOnline() });
});

async function sendServerCommand(cmd) {
  return runScript(config.SEND_CMD_SCRIPT, [cmd], 5000);
}

router.post('/players/:name/:action', auth, requirePerm('console.write'), async (req, res) => {
  const { name, action } = req.params;
  if (!/^[A-Za-z0-9_]{2,32}$/.test(name)) {
    return res.status(400).json({ error: 'Ungültiger Name' });
  }
  let cmd;
  switch (action) {
    case 'kick': cmd = `kick ${name}`; break;
    case 'ban':  cmd = `ban ${name}`;  break;
    case 'unban': cmd = `unban ${name}`; break;
    case 'op':   cmd = `op ${name}`;   break;
    case 'deop': cmd = `deop ${name}`; break;
    default: return res.status(400).json({ error: 'Unbekannte Aktion' });
  }
  if (!sanitizeCommand(cmd)) return res.status(400).json({ error: 'Befehl abgelehnt' });
  try {
    await sendServerCommand(cmd);
    logActivity(req.user.username, `${action}: ${name}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
