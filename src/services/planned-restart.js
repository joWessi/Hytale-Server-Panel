// Flag file consumed by hytale-crash-notify.sh to suppress crash alerts on planned restarts
const fs = require('fs');

const FLAG = '/tmp/hytale-planned-restart';

function markPlannedRestart() {
  try { fs.writeFileSync(FLAG, ''); } catch { /* ignore */ }
}

module.exports = { markPlannedRestart, FLAG };
