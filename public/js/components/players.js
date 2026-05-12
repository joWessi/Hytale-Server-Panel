// Online players + actions (kick/ban/op)
import { api } from '../api.js';
import { showToast, hasPerm, confirmDialog, escapeHtml } from '../utils.js';

let refreshInterval = null;

export function renderPlayers(container) {
  const canWrite = hasPerm('console.write');
  container.innerHTML = `
    <div class="card p-4">
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-medium">Spieler online</h3>
        <button id="btn-refresh" class="text-panel-dim hover:text-panel-accent text-sm">Aktualisieren</button>
      </div>
      <div id="player-list" class="space-y-2"></div>
      ${canWrite ? `
        <div class="mt-6 pt-4 border-t border-panel-border">
          <h3 class="text-sm font-medium mb-2">Aktion auf Spielernamen</h3>
          <div class="flex flex-col sm:flex-row gap-2">
            <input type="text" id="manual-name" class="flex-1 px-3 py-2 text-sm font-mono" placeholder="Spielername...">
            <select id="manual-action" class="px-3 py-2 text-sm">
              <option value="kick">Kick</option>
              <option value="ban">Ban</option>
              <option value="unban">Unban</option>
              <option value="op">OP</option>
              <option value="deop">Deop</option>
            </select>
            <button id="btn-manual" class="btn-warning px-4 py-2 text-sm">Ausfuehren</button>
          </div>
          <p class="text-xs text-panel-dim mt-1">Auch fuer Spieler die nicht online sind (z.B. ban/unban)</p>
        </div>` : ''}
    </div>`;

  document.getElementById('btn-refresh').addEventListener('click', load);
  if (canWrite) {
    document.getElementById('btn-manual').addEventListener('click', () => {
      const name = document.getElementById('manual-name').value.trim();
      const action = document.getElementById('manual-action').value;
      if (!name) { showToast('Name erforderlich', 'error'); return; }
      doAction(name, action);
    });
  }

  load();
  refreshInterval = setInterval(load, 10000);
  return () => { clearInterval(refreshInterval); refreshInterval = null; };
}

async function load() {
  try {
    const d = await api('GET', '/players');
    const el = document.getElementById('player-list');
    if (!d.running) {
      el.innerHTML = '<div class="text-panel-dim text-center py-8 text-sm">Server offline</div>';
      return;
    }
    if (!d.players?.length) {
      el.innerHTML = '<div class="text-panel-dim text-center py-8 text-sm">Niemand online</div>';
      return;
    }
    const canWrite = hasPerm('console.write');
    el.innerHTML = d.players.map(p => `
      <div class="flex items-center gap-3 p-3 rounded-lg bg-panel-bg text-sm">
        <div class="w-2 h-2 rounded-full status-online"></div>
        <span class="flex-1 font-mono">${escapeHtml(p.name)}</span>
        ${canWrite ? `
          <button class="text-xs btn-secondary px-2 py-1" data-action="op" data-name="${escapeHtml(p.name)}">OP</button>
          <button class="text-xs btn-warning px-2 py-1" data-action="kick" data-name="${escapeHtml(p.name)}">Kick</button>
          <button class="text-xs btn-danger px-2 py-1" data-action="ban" data-name="${escapeHtml(p.name)}">Ban</button>
        ` : ''}
      </div>`).join('');

    el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => doAction(btn.dataset.name, btn.dataset.action));
    });
  } catch (e) { showToast(e.message, 'error'); }
}

async function doAction(name, action) {
  const labels = { kick: 'kicken', ban: 'bannen', unban: 'entbannen', op: 'OPpen', deop: 'deOPpen' };
  const danger = action === 'ban' || action === 'kick';
  const ok = await confirmDialog(`${name} ${labels[action] || action}?`, { danger, ok: 'Bestaetigen' });
  if (!ok) return;
  try {
    await api('POST', `/players/${encodeURIComponent(name)}/${action}`);
    showToast(`${name} ${labels[action] || action}`);
    setTimeout(load, 1000);
  } catch (e) { showToast(e.message, 'error'); }
}
