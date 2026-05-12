// Player list + actions (kick/ban/op)
const express = require('express');
const fs = require('fs');
const config = require('../config');
const { auth, requirePerm } = require('../middleware/auth');
const { runScript, isServerActive } = require('../services/server-control');
const { sanitizeCommand } = require('../middleware/security');
const { logActivity } = require('../data/store');

const router = express.Router();

function parsePlayersFromLog() {
  // Hytale logs join/leave events; we maintain a "currently online" set by replay.
  // Stub: parse last N lines for join/leave patterns. Hytale's exact log format
  // varies, so this looks for common patterns - tune when real format is known.
  if (!fs.existsSync(config.CONSOLE_LOG)) return [];
  try {
    const content = fs.readFileSync(config.CONSOLE_LOG, 'utf8');
    const lines = content.split('\n').slice(-2000);
    const online = new Map();
    const joinRe = /(?:joined|connected)[: ]+([A-Za-z0-9_]{2,32})/i;
    const leaveRe = /(?:left|disconnected|quit)[: ]+([A-Za-z0-9_]{2,32})/i;
    for (const line of lines) {
      const j = joinRe.exec(line);
      if (j) { online.set(j[1], { name: j[1], since: Date.now() }); continue; }
      const l = leaveRe.exec(line);
      if (l) { online.delete(l[1]); }
    }
    return [...online.values()];
  } catch {
    return [];
  }
}

router.get('/players', auth, async (req, res) => {
  const running = await isServerActive();
  if (!running) return res.json({ running: false, players: [] });
  res.json({ running: true, players: parsePlayersFromLog() });
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
