// Dashboard component
import { api } from '../api.js';
import { formatUptime, formatTimeAgo, copyToClipboard, showToast } from '../utils.js';
import { setQuickStatus } from './layout.js';

let refreshInterval = null;
let currentPlayers = 0;

export function renderDashboard(container) {
  container.innerHTML = `
    <div class="card p-5 mb-4">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="flex items-center gap-4">
          <div id="status-dot" class="w-4 h-4 rounded-full bg-panel-border"></div>
          <div>
            <div id="status-text" class="text-xl font-bold">Lade...</div>
            <div id="uptime-text" class="text-sm text-panel-dim">Uptime: --</div>
          </div>
        </div>
        <div id="control-btns" class="flex gap-2"></div>
      </div>
    </div>
    <div class="card p-4 mb-4">
      <div class="text-xs text-panel-dim uppercase mb-2 font-medium tracking-wide">Server Verbindung</div>
      <div class="flex flex-col sm:flex-row gap-2">
        <div id="server-addr" class="flex-1 bg-panel-bg rounded-lg px-4 py-2.5 font-mono text-panel-accent text-sm">--</div>
        <button id="btn-copy-addr" class="btn-primary px-4 py-2.5 text-sm">Kopieren</button>
      </div>
    </div>
    <div id="whitelist-card" class="card p-4 mb-4 hidden">
      <div class="flex items-center gap-3">
        <div id="wl-dot" class="w-3 h-3 rounded-full bg-panel-dim"></div>
        <span class="text-sm"><strong>Whitelist:</strong> <span id="wl-text">--</span></span>
      </div>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <div class="card p-4">
        <div class="text-xs text-panel-dim uppercase mb-1">CPU</div>
        <div id="cpu-val" class="text-xl font-bold">--%</div>
        <div class="progress-bg h-1.5 mt-2"><div id="cpu-bar" class="progress-fill bg-blue-500" style="width:0%"></div></div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-panel-dim uppercase mb-1">RAM</div>
        <div id="mem-val" class="text-xl font-bold">--%</div>
        <div class="progress-bg h-1.5 mt-2"><div id="mem-bar" class="progress-fill bg-purple-500" style="width:0%"></div></div>
        <div id="mem-detail" class="text-xs text-panel-dim mt-1">--</div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-panel-dim uppercase mb-1">Speicher</div>
        <div id="disk-val" class="text-xl font-bold">--%</div>
        <div class="progress-bg h-1.5 mt-2"><div id="disk-bar" class="progress-fill bg-emerald-500" style="width:0%"></div></div>
        <div id="disk-detail" class="text-xs text-panel-dim mt-1">--</div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-panel-dim uppercase mb-1">Spieler</div>
        <div id="players-val" class="text-xl font-bold text-amber-400">--</div>
        <div class="text-xs text-panel-dim mt-3">Online</div>
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div class="card p-4">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs text-panel-dim uppercase font-medium">Auto-Restart</span>
          <span id="restart-badge" class="px-2 py-0.5 rounded text-xs bg-panel-border text-panel-dim">--</span>
        </div>
        <div class="text-sm space-y-1">
          <div class="flex justify-between"><span class="text-panel-dim">Naechster</span><span id="next-restart">--</span></div>
          <div class="flex justify-between"><span class="text-panel-dim">Letzter</span><span id="last-restart" class="text-panel-dim">--</span></div>
        </div>
      </div>
      <div class="card p-4">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs text-panel-dim uppercase font-medium">Auto-Backup</span>
          <span id="backup-badge" class="px-2 py-0.5 rounded text-xs bg-panel-border text-panel-dim">--</span>
        </div>
        <div class="text-sm space-y-1">
          <div class="flex justify-between"><span class="text-panel-dim">Naechstes</span><span id="next-backup">--</span></div>
          <div class="flex justify-between"><span class="text-panel-dim">Letztes</span><span id="last-backup" class="text-panel-dim">--</span></div>
        </div>
      </div>
    </div>`;

  document.getElementById('btn-copy-addr').addEventListener('click', () => {
    copyToClipboard(document.getElementById('server-addr').textContent);
  });

  loadAll();
  refreshInterval = setInterval(loadAll, 5000);
  return () => { clearInterval(refreshInterval); refreshInterval = null; };
}

async function loadAll() {
  loadStatus();
  loadSystem();
  loadDisk();
  loadAddress();
  loadScheduler();
  loadWhitelist();
}

async function loadStatus() {
  try {
    const d = await api('GET', '/status');
    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-text');
    const up = document.getElementById('uptime-text');
    if (d.running) {
      dot.className = 'w-4 h-4 rounded-full status-online';
      txt.textContent = 'SERVER ONLINE';
      txt.className = 'text-xl font-bold text-panel-accent';
    } else {
      dot.className = 'w-4 h-4 rounded-full status-offline';
      txt.textContent = 'SERVER OFFLINE';
      txt.className = 'text-xl font-bold text-red-400';
    }
    up.textContent = `Uptime: ${formatUptime(d.uptime)}`;
    currentPlayers = d.running ? (d.players || 0) : 0;
    const pe = document.getElementById('players-val');
    if (pe) pe.textContent = d.running ? currentPlayers : '-';
    setQuickStatus(d.running);
    renderControlButtons(d.running);
  } catch { /* ignore */ }
}

function renderControlButtons(running) {
  const btns = document.getElementById('control-btns');
  if (!btns) return;
  // Check permission via the globally available user object
  if (!window.__panelUser?.permissions?.includes('server.control') && window.__panelUser?.role !== 'admin') {
    btns.innerHTML = '';
    return;
  }
  btns.innerHTML = running
    ? `<button class="btn-danger px-4 py-2 text-sm" data-action="stop">Stop</button>
       <button class="btn-warning px-4 py-2 text-sm" data-action="restart">Restart</button>`
    : `<button class="btn-primary px-4 py-2 text-sm" data-action="start">Start</button>`;

  btns.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleServerAction(btn.dataset.action));
  });
}

let actionRunning = false;
async function handleServerAction(action) {
  if (actionRunning) return;
  if ((action === 'stop' || action === 'restart') && currentPlayers > 0) {
    if (!confirm(`Server ${action === 'stop' ? 'stoppen' : 'neustarten'}? ${currentPlayers} Spieler online.`)) return;
  }
  actionRunning = true;
  const btns = document.getElementById('control-btns');
  if (btns) btns.innerHTML = '<button disabled class="btn-secondary px-4 py-2 text-sm">Bitte warten...</button>';
  try {
    const d = await api('POST', `/server/${action}`);
    if (d.success === false) showToast(d.message || 'Fehler', 'error');
    else showToast('Aktion ausgefuehrt');
  } catch { showToast('Fehler', 'error'); }
  setTimeout(() => { actionRunning = false; loadStatus(); }, 5000);
}

async function loadSystem() {
  try {
    const d = await api('GET', '/system');
    setText('cpu-val', `${d.cpu}%`); setWidth('cpu-bar', d.cpu);
    setText('mem-val', `${d.memPercent}%`); setWidth('mem-bar', d.memPercent);
    setText('mem-detail', `${d.memUsed} / ${d.memTotal} MB`);
  } catch { /* ignore */ }
}

async function loadDisk() {
  try {
    const d = await api('GET', '/disk');
    setText('disk-val', `${d.percent}%`); setWidth('disk-bar', d.percent);
    setText('disk-detail', `${d.used} / ${d.total}`);
  } catch { /* ignore */ }
}

async function loadAddress() {
  try {
    const d = await api('GET', '/server-address');
    setText('server-addr', d.address || 'Nicht konfiguriert');
  } catch { /* ignore */ }
}

async function loadScheduler() {
  try {
    const d = await api('GET', '/scheduler');
    const rb = document.getElementById('restart-badge');
    if (rb) {
      if (d.autoRestart) { rb.textContent = 'Aktiv'; rb.className = 'px-2 py-0.5 rounded text-xs bg-panel-accent/20 text-panel-accent'; }
      else { rb.textContent = 'Aus'; rb.className = 'px-2 py-0.5 rounded text-xs bg-panel-border text-panel-dim'; }
      setText('next-restart', d.autoRestart ? d.restartTime : '-');
      setText('last-restart', d.lastRestart ? formatTimeAgo(d.lastRestart) : 'Nie');
    }
    const bb = document.getElementById('backup-badge');
    if (bb) {
      if (d.autoBackup) { bb.textContent = 'Aktiv'; bb.className = 'px-2 py-0.5 rounded text-xs bg-panel-accent/20 text-panel-accent'; }
      else { bb.textContent = 'Aus'; bb.className = 'px-2 py-0.5 rounded text-xs bg-panel-border text-panel-dim'; }
      setText('next-backup', d.autoBackup ? d.backupTime : '-');
      setText('last-backup', d.lastBackup ? formatTimeAgo(d.lastBackup) : 'Nie');
    }
  } catch { /* ignore - user may not have scheduler permission */ }
}

async function loadWhitelist() {
  try {
    const d = await api('GET', '/users/me/whitelist');
    const card = document.getElementById('whitelist-card');
    const dot = document.getElementById('wl-dot');
    const txt = document.getElementById('wl-text');
    if (!card) return;
    card.classList.remove('hidden');
    if (d.whitelisted) {
      dot.className = 'w-3 h-3 rounded-full status-online';
      txt.innerHTML = '<span class="text-panel-accent">Freigeschaltet</span>';
    } else if (d.enabled === false) {
      dot.className = 'w-3 h-3 rounded-full status-offline';
      txt.innerHTML = '<span class="text-red-400">Zugang gesperrt</span>';
    } else if (!d.uuid) {
      dot.className = 'w-3 h-3 rounded-full bg-amber-500';
      txt.innerHTML = '<span class="text-amber-400">Keine UUID hinterlegt</span>';
    } else {
      dot.className = 'w-3 h-3 rounded-full status-offline';
      txt.innerHTML = '<span class="text-red-400">Nicht auf Whitelist</span>';
    }
  } catch { /* ignore */ }
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setWidth(id, pct) { const el = document.getElementById(id); if (el) el.style.width = `${pct}%`; }
