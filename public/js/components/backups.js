// Backups
import { api, downloadUrl } from '../api.js';
import { formatSize, showToast, hasPerm, confirmDialog, formatTimeAgo, escapeHtml } from '../utils.js';

export function renderBackups(container) {
  const canManage = hasPerm('backups.manage');
  container.innerHTML = `
    <div class="card p-4">
      <div class="flex justify-between items-start mb-4 flex-wrap gap-2">
        <div>
          <h3 class="font-medium">Backups</h3>
          <p id="backup-info" class="text-xs text-panel-dim">--</p>
        </div>
        ${canManage ? '<button id="btn-create-backup" class="btn-primary px-4 py-2 text-sm">Erstellen</button>' : ''}
      </div>
      <div id="backup-list" class="space-y-2"></div>
    </div>`;

  if (canManage) {
    document.getElementById('btn-create-backup').addEventListener('click', createBackup);
  }
  load();
  return null;
}

async function load() {
  try {
    const d = await api('GET', '/backups');
    const info = document.getElementById('backup-info');
    if (d.retention === 'gfs') {
      info.textContent = `Strategie: GFS (7 taeglich, 4 woechentlich, 6 monatlich)`;
    } else {
      info.textContent = `Strategie: FIFO, max. ${d.maxBackups} Backups`;
    }

    const list = document.getElementById('backup-list');
    if (!d.backups?.length) {
      list.innerHTML = '<div class="text-panel-dim text-center py-8 text-sm">Keine Backups</div>';
      return;
    }
    const canManage = hasPerm('backups.manage');
    list.innerHTML = d.backups.map(b => `
      <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg bg-panel-bg">
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate">${escapeHtml(b.name)}</div>
          <div class="text-xs text-panel-dim">${formatSize(b.size)} &middot; ${escapeHtml(formatTimeAgo(b.created))}</div>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <a href="${downloadUrl(`/backups/download?name=${encodeURIComponent(b.name)}`)}" class="btn-secondary px-3 py-1.5 text-xs">Download</a>
          ${canManage ? `<button class="btn-warning px-3 py-1.5 text-xs" data-restore="${escapeHtml(b.name)}">Restore</button>` : ''}
          ${canManage ? `<button class="btn-danger px-3 py-1.5 text-xs" data-delete="${escapeHtml(b.name)}">Loeschen</button>` : ''}
        </div>
      </div>`).join('');

    list.querySelectorAll('[data-restore]').forEach(btn => btn.addEventListener('click', () => restore(btn.dataset.restore)));
    list.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', () => del(btn.dataset.delete)));
  } catch (e) { showToast(e.message, 'error'); }
}

async function createBackup() {
  showToast('Erstelle Backup...');
  try {
    const d = await api('POST', '/backups');
    if (d.success) { showToast('Backup erstellt'); load(); }
    else showToast(d.message || 'Fehler', 'error');
  } catch (e) { showToast(e.message, 'error'); }
}

async function del(name) {
  const ok = await confirmDialog(`Backup "${name}" loeschen?`, { danger: true, ok: 'Loeschen' });
  if (!ok) return;
  try { await api('DELETE', `/backups/${encodeURIComponent(name)}`); showToast('Geloescht'); load(); }
  catch (e) { showToast(e.message, 'error'); }
}

async function restore(name) {
  const ok = await confirmDialog(
    'Backup wiederherstellen?\nServer wird gestoppt und Welt ueberschrieben!',
    { danger: true, ok: 'Wiederherstellen' }
  );
  if (!ok) return;
  showToast('Restore laeuft...');
  try {
    const d = await api('POST', `/backups/restore/${encodeURIComponent(name)}`);
    if (d.success) showToast('Wiederhergestellt');
    else showToast(d.error || 'Fehler', 'error');
  } catch (e) { showToast(e.message, 'error'); }
}
