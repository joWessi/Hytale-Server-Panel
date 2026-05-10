// Backups component
import { api, downloadUrl } from '../api.js';
import { formatSize, showToast } from '../utils.js';

export function renderBackups(container) {
  const canManage = window.__panelUser?.role === 'admin' || window.__panelUser?.permissions?.includes('backups.manage');
  const createBtn = canManage ? '<button id="btn-create-backup" class="btn-primary px-4 py-2 text-sm">Erstellen</button>' : '';

  container.innerHTML = `
    <div class="card p-4">
      <div class="flex justify-between items-center mb-4">
        <div>
          <h3 class="font-medium">Backups</h3>
          <p class="text-xs text-panel-dim">Max. 3 Backups</p>
        </div>
        ${createBtn}
      </div>
      <div id="backup-list" class="space-y-2"></div>
    </div>`;

  if (canManage) {
    document.getElementById('btn-create-backup')?.addEventListener('click', createBackup);
  }
  loadBackups();
  return null;
}

async function loadBackups() {
  try {
    const d = await api('GET', '/backups');
    const list = document.getElementById('backup-list');
    if (!d.backups?.length) {
      list.innerHTML = '<div class="text-panel-dim text-center py-8 text-sm">Keine Backups</div>';
      return;
    }
    const canManage = window.__panelUser?.role === 'admin' || window.__panelUser?.permissions?.includes('backups.manage');
    list.innerHTML = d.backups.map(b => `
      <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg bg-panel-bg">
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate">${b.name}</div>
          <div class="text-xs text-panel-dim">${formatSize(b.size)}</div>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <a href="${downloadUrl(`/backups/download?name=${encodeURIComponent(b.name)}`)}" class="btn-secondary px-3 py-1.5 text-xs">Download</a>
          ${canManage ? `<button class="btn-warning px-3 py-1.5 text-xs" data-restore="${b.name}">Restore</button>` : ''}
          ${canManage ? `<button class="btn-danger px-3 py-1.5 text-xs" data-delete="${b.name}">Loeschen</button>` : ''}
        </div>
      </div>`).join('');

    list.querySelectorAll('[data-restore]').forEach(btn => {
      btn.addEventListener('click', () => restoreBackup(btn.dataset.restore));
    });
    list.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteBackup(btn.dataset.delete));
    });
  } catch { /* ignore */ }
}

async function createBackup() {
  showToast('Erstelle Backup...');
  try {
    const d = await api('POST', '/backups');
    if (d.success) { showToast('Backup erstellt'); loadBackups(); }
    else showToast(d.message || 'Fehler', 'error');
  } catch { showToast('Fehler', 'error'); }
}

async function deleteBackup(name) {
  if (!confirm(`Backup "${name}" loeschen?`)) return;
  try {
    await api('DELETE', `/backups/${encodeURIComponent(name)}`);
    showToast('Geloescht');
    loadBackups();
  } catch { showToast('Fehler', 'error'); }
}

async function restoreBackup(name) {
  if (!confirm('Backup wiederherstellen? Der Server wird neugestartet und die aktuelle Welt ueberschrieben!')) return;
  showToast('Backup wird wiederhergestellt...');
  try {
    const d = await api('POST', `/backups/restore/${encodeURIComponent(name)}`);
    if (d.success) showToast('Backup wiederhergestellt!');
    else showToast(d.error || 'Fehler', 'error');
  } catch { showToast('Restore fehlgeschlagen', 'error'); }
}
