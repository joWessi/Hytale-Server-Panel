// Dedicated whitelist tab — shows every (name, uuid) the server has seen,
// who they're assigned to in the panel, and lets the admin add/remove from
// the Hytale whitelist directly.
import { api } from '../api.js';
import { showToast, escapeHtml, confirmDialog, formatTimeAgo } from '../utils.js';

let refreshTimer = null;

export function renderWhitelist(container) {
  container.innerHTML = `
    <div id="wl-pending" class="card p-4 mb-4 hidden">
      <h3 class="font-medium text-amber-400 mb-2">Pending Join-Versuche</h3>
      <p class="text-xs text-panel-dim mb-3">Spieler die aktuell vom Whitelist-Check abgelehnt wurden.</p>
      <div id="wl-pending-list" class="space-y-2"></div>
    </div>

    <div class="card p-4">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
        <div>
          <h3 class="font-medium">Bekannte Spieler</h3>
          <p class="text-xs text-panel-dim">Jede (Name, UUID) Kombination die der Server gesehen hat — wird gespeichert.</p>
        </div>
        <div class="flex gap-2">
          <input type="text" id="wl-filter" class="px-3 py-1.5 text-sm" placeholder="Filter Name/UUID...">
          <button id="wl-refresh" class="btn-secondary px-3 py-1.5 text-sm">Aktualisieren</button>
        </div>
      </div>
      <div id="wl-known-list" class="space-y-2"></div>
    </div>`;

  document.getElementById('wl-refresh').addEventListener('click', loadAll);
  document.getElementById('wl-filter').addEventListener('input', renderKnown);

  loadAll();
  refreshTimer = setInterval(loadAll, 15000);

  return () => { clearInterval(refreshTimer); refreshTimer = null; };
}

let _known = [];
let _pending = [];

async function loadAll() {
  try {
    const [k, p] = await Promise.all([
      api('GET', '/known-players'),
      api('GET', '/whitelist/pending'),
    ]);
    _known = k.known || [];
    _pending = p.pending || [];
    renderPending();
    renderKnown();
  } catch (e) { showToast(e.message, 'error'); }
}

function renderPending() {
  const card = document.getElementById('wl-pending');
  const list = document.getElementById('wl-pending-list');
  if (!_pending.length) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  list.innerHTML = _pending.map(p => `
    <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg bg-panel-bg">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium">${escapeHtml(p.name)}</div>
        <div class="text-xs text-panel-dim font-mono break-all">${escapeHtml(p.uuid)}</div>
        <div class="text-[10px] text-panel-dim">vor ${escapeHtml(formatTimeAgo(p.lastAttempt))}</div>
      </div>
      <div class="flex gap-2 flex-shrink-0">
        <button class="btn-primary px-3 py-1.5 text-xs" data-add="${escapeHtml(p.uuid)}" data-name="${escapeHtml(p.name)}">Zur Whitelist</button>
        <button class="btn-secondary px-3 py-1.5 text-xs" data-dismiss="${escapeHtml(p.uuid)}">Verwerfen</button>
      </div>
    </div>
  `).join('');
  list.querySelectorAll('[data-add]').forEach(b => {
    b.addEventListener('click', () => addToWhitelist(b.dataset.add, b.dataset.name));
  });
  list.querySelectorAll('[data-dismiss]').forEach(b => {
    b.addEventListener('click', () => dismissPending(b.dataset.dismiss));
  });
}

function renderKnown() {
  const list = document.getElementById('wl-known-list');
  const filter = (document.getElementById('wl-filter').value || '').toLowerCase();
  let items = _known;
  if (filter) {
    items = items.filter(p => p.name.toLowerCase().includes(filter) || p.uuid.toLowerCase().includes(filter));
  }
  if (!items.length) {
    list.innerHTML = '<div class="text-panel-dim text-center py-8 text-sm">Noch keine Spieler gesehen</div>';
    return;
  }
  list.innerHTML = items.map(p => {
    const assigned = p.assignedTo
      ? `<span class="text-[11px] px-2 py-0.5 rounded bg-panel-accent/20 text-panel-accent">${escapeHtml(p.assignedTo)}</span>`
      : `<span class="text-[11px] px-2 py-0.5 rounded bg-panel-border text-panel-dim">nicht zugewiesen</span>`;
    return `
      <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg bg-panel-bg">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-medium">${escapeHtml(p.name)}</span>
            ${assigned}
          </div>
          <div class="text-xs text-panel-dim font-mono break-all">${escapeHtml(p.uuid)}</div>
          <div class="text-[10px] text-panel-dim">zuletzt gesehen ${escapeHtml(formatTimeAgo(p.lastSeen))}</div>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          ${p.assignedTo
            ? `<button class="btn-danger px-3 py-1.5 text-xs" data-unassign="${escapeHtml(p.assignedTo)}">UUID entfernen</button>`
            : `<button class="btn-primary px-3 py-1.5 text-xs" data-quick="${escapeHtml(p.uuid)}" data-name="${escapeHtml(p.name)}">Neuen User mit UUID anlegen</button>`
          }
        </div>
      </div>`;
  }).join('');
  list.querySelectorAll('[data-unassign]').forEach(b => {
    b.addEventListener('click', () => unassignFromUser(b.dataset.unassign));
  });
  list.querySelectorAll('[data-quick]').forEach(b => {
    b.addEventListener('click', () => quickCreateWithUuid(b.dataset.quick, b.dataset.name));
  });
}

async function addToWhitelist(uuid, name) {
  // Hytale stores the whitelist by UUID. We add by UUID directly — but the
  // panel's syncWhitelist would remove it again because no panel user has
  // that UUID. So instead: prompt the admin to create a user with this UUID.
  await quickCreateWithUuid(uuid, name);
}

async function quickCreateWithUuid(uuid, name) {
  // Hand off to the users tab with the pending UUID pre-filled.
  location.hash = '#users';
  setTimeout(async () => {
    const addPanel = document.getElementById('add-panel');
    if (addPanel) {
      addPanel.classList.remove('hidden');
      document.getElementById('new-user').value = name;
      document.getElementById('new-pass').focus();
      addPanel.dataset.pendingUuid = uuid;
      showToast(`Setze Passwort für ${name} (UUID wird beim Erstellen übernommen)`);
    }
  }, 300);
}

async function unassignFromUser(username) {
  const ok = await confirmDialog(`UUID von Benutzer "${username}" entfernen?\n(User bleibt, ist aber nicht mehr whitelisted)`, { danger: true, ok: 'Entfernen' });
  if (!ok) return;
  try {
    await api('PATCH', `/users/${encodeURIComponent(username)}`, { uuid: '' });
    showToast('UUID entfernt');
    loadAll();
  } catch (e) { showToast(e.message, 'error'); }
}

async function dismissPending(uuid) {
  try { await api('DELETE', `/whitelist/pending/${encodeURIComponent(uuid)}`); loadAll(); }
  catch (e) { showToast(e.message, 'error'); }
}
