// Dashboard component
import { api } from '../api.js';
import { formatUptime, formatTimeAgo, copyToClipboard, showToast, hasPerm, confirmDialog, renderLineChart } from '../utils.js';
import { setQuickStatus } from './layout.js';

let refreshInterval = null;
let chartsInterval = null;
let currentPlayers = 0;
let actionRunning = false;

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
      <div id="crash-warn" class="hidden mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300"></div>
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

    <div class="card p-4 mb-4">
      <div class="flex justify-between items-baseline mb-2">
        <h3 class="text-sm font-medium">Verlauf (24h)</h3>
        <div class="flex gap-1 text-xs">
          <button class="px-2 py-0.5 rounded bg-panel-border" data-range="6">6h</button>
          <button class="px-2 py-0.5 rounded bg-panel-accent/30 text-panel-accent" data-range="24">24h</button>
          <button class="px-2 py-0.5 rounded bg-panel-border" data-range="168">7d</button>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div class="text-xs text-panel-dim mb-1">CPU</div>
          <div id="chart-cpu"></div>
        </div>
        <div>
          <div class="text-xs text-panel-dim mb-1">RAM</div>
          <div id="chart-mem"></div>
        </div>
        <div>
          <div class="text-xs text-panel-dim mb-1">Spieler</div>
          <div id="chart-players"></div>
        </div>
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

  document.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-range]').forEach(b => {
        b.className = b === btn
          ? 'px-2 py-0.5 rounded bg-panel-accent/30 text-panel-accent'
          : 'px-2 py-0.5 rounded bg-panel-border';
      });
      loadCharts(parseInt(btn.dataset.range, 10));
    });
  });

  loadDashboard();
  loadCharts(24);
  refreshInterval = setInterval(loadDashboard, 5000);
  chartsInterval = setInterval(() => {
    const active = document.querySelector('[data-range].bg-panel-accent\\/30');
    loadCharts(parseInt(active?.dataset.range, 10) || 24);
  }, 60000);

  return () => {
    clearInterval(refreshInterval); refreshInterval = null;
    clearInterval(chartsInterval); chartsInterval = null;
  };
}

async function loadDashboard() {
  try {
    const d = await api('GET', '/dashboard');
    paintStatus(d.server);
    paintSystem(d.system, d.disk);
    paintAddress(d.address);
    paintScheduler(d.scheduler);
    paintWhitelist(d.whitelist);
    paintCrash(d.crashStats);
    currentPlayers = d.server.running ? (d.server.players || 0) : 0;
  } catch { /* ignore one-off fail */ }
}

async function loadCharts(hours) {
  try {
    const d = await api('GET', `/dashboard/metrics?hours=${hours}`);
    const cpu = d.samples.map(s => ({ t: s.t, v: s.cpu }));
    const mem = d.samples.map(s => ({ t: s.t, v: s.mem }));
    const ply = d.samples.map(s => ({ t: s.t, v: s.players }));
    renderLineChart(document.getElementById('chart-cpu'), cpu, { min: 0, max: 100, unit: '%', color: '#3b82f6' });
    renderLineChart(document.getElementById('chart-mem'), mem, { min: 0, max: 100, unit: '%', color: '#a855f7' });
    const maxPly = Math.max(10, ...ply.map(p => p.v));
    renderLineChart(document.getElementById('chart-players'), ply, { min: 0, max: maxPly, color: '#f59e0b' });
  } catch { /* ignore */ }
}

function paintStatus(s) {
  const dot = document.getElementById('status-dot');
  const txt = document.getElementById('status-text');
  if (s.running) {
    dot.className = 'w-4 h-4 rounded-full status-online';
    txt.textContent = 'SERVER ONLINE';
    txt.className = 'text-xl font-bold text-panel-accent';
  } else {
    dot.className = 'w-4 h-4 rounded-full status-offline';
    txt.textContent = 'SERVER OFFLINE';
    txt.className = 'text-xl font-bold text-red-400';
  }
  document.getElementById('uptime-text').textContent = `Uptime: ${formatUptime(s.uptime)}`;
  const pv = document.getElementById('players-val');
  if (pv) pv.textContent = s.running ? s.players : '-';
  setQuickStatus(s.running);
  renderControlButtons(s.running);
}

function renderControlButtons(running) {
  const btns = document.getElementById('control-btns');
  if (!btns) return;
  if (!hasPerm('server.control')) { btns.innerHTML = ''; return; }
  btns.innerHTML = running
    ? `<button class="btn-danger px-4 py-2 text-sm" data-action="stop">Stop</button>
       <button class="btn-warning px-4 py-2 text-sm" data-action="restart">Restart</button>`
    : `<button class="btn-primary px-4 py-2 text-sm" data-action="start">Start</button>`;
  btns.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action));
  });
}

async function handleAction(action) {
  if (actionRunning) return;
  if ((action === 'stop' || action === 'restart') && currentPlayers > 0) {
    const ok = await confirmDialog(
      `${action === 'stop' ? 'Server stoppen' : 'Server neustarten'}?\n${currentPlayers} Spieler online.`,
      { danger: true, ok: action === 'stop' ? 'Stoppen' : 'Neustarten' }
    );
    if (!ok) return;
  }
  actionRunning = true;
  const btns = document.getElementById('control-btns');
  if (btns) btns.innerHTML = '<button disabled class="btn-secondary px-4 py-2 text-sm">Bitte warten...</button>';
  try {
    const d = await api('POST', `/server/${action}`);
    if (d.success === false) showToast(d.message || 'Fehler', 'error');
    else showToast('Aktion ausgefuehrt');
  } catch (e) { showToast(e.message || 'Fehler', 'error'); }
  setTimeout(() => { actionRunning = false; loadDashboard(); }, 5000);
}

function paintSystem(sys, disk) {
  setText('cpu-val', `${sys.cpu}%`); setWidth('cpu-bar', sys.cpu);
  setText('mem-val', `${sys.memPercent}%`); setWidth('mem-bar', sys.memPercent);
  setText('mem-detail', `${sys.memUsed} / ${sys.memTotal} MB`);
  setText('disk-val', `${disk.percent}%`); setWidth('disk-bar', disk.percent);
  setText('disk-detail', `${disk.used} / ${disk.total}`);
}

function paintAddress(addr) {
  setText('server-addr', addr || 'Nicht konfiguriert');
}

function paintScheduler(s) {
  const rb = document.getElementById('restart-badge');
  if (s.autoRestart) { rb.textContent = 'Aktiv'; rb.className = 'px-2 py-0.5 rounded text-xs bg-panel-accent/20 text-panel-accent'; }
  else { rb.textContent = 'Aus'; rb.className = 'px-2 py-0.5 rounded text-xs bg-panel-border text-panel-dim'; }
  setText('next-restart', s.autoRestart ? s.restartTime : '-');
  setText('last-restart', s.lastRestart ? formatTimeAgo(s.lastRestart) : 'Nie');

  const bb = document.getElementById('backup-badge');
  if (s.autoBackup) { bb.textContent = 'Aktiv'; bb.className = 'px-2 py-0.5 rounded text-xs bg-panel-accent/20 text-panel-accent'; }
  else { bb.textContent = 'Aus'; bb.className = 'px-2 py-0.5 rounded text-xs bg-panel-border text-panel-dim'; }
  setText('next-backup', s.autoBackup ? s.backupTime : '-');
  setText('last-backup', s.lastBackup ? formatTimeAgo(s.lastBackup) : 'Nie');
}

function paintWhitelist(wl) {
  const card = document.getElementById('whitelist-card');
  const dot = document.getElementById('wl-dot');
  const txt = document.getElementById('wl-text');
  if (!card) return;
  card.classList.remove('hidden');
  if (wl.whitelisted) {
    dot.className = 'w-3 h-3 rounded-full status-online';
    txt.innerHTML = '<span class="text-panel-accent">Freigeschaltet</span>';
  } else if (wl.enabled === false) {
    dot.className = 'w-3 h-3 rounded-full status-offline';
    txt.innerHTML = '<span class="text-red-400">Zugang gesperrt</span>';
  } else if (!wl.uuid) {
    dot.className = 'w-3 h-3 rounded-full bg-amber-500';
    txt.innerHTML = '<span class="text-amber-400">Keine UUID hinterlegt</span>';
  } else {
    dot.className = 'w-3 h-3 rounded-full status-offline';
    txt.innerHTML = '<span class="text-red-400">Nicht auf Whitelist</span>';
  }
}

function paintCrash(stats) {
  const el = document.getElementById('crash-warn');
  if (!el) return;
  if (stats && stats.loopActive) {
    el.classList.remove('hidden');
    el.textContent = `Crash-Loop erkannt: ${stats.recentCrashes} Crashes in ${stats.windowMinutes} Min. Auto-Restart pausiert.`;
  } else if (stats && stats.recentCrashes > 0) {
    el.classList.remove('hidden');
    el.classList.remove('bg-red-500/10', 'border-red-500/30', 'text-red-300');
    el.classList.add('bg-amber-500/10', 'border-amber-500/30', 'text-amber-300');
    el.textContent = `${stats.recentCrashes} ${stats.recentCrashes === 1 ? 'Crash' : 'Crashes'} in ${stats.windowMinutes} Min.`;
  } else {
    el.classList.add('hidden');
  }
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setWidth(id, pct) { const el = document.getElementById(id); if (el) el.style.width = `${pct}%`; }
