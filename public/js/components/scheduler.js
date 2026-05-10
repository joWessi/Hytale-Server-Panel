// Scheduler settings component
import { api } from '../api.js';
import { showToast } from '../utils.js';

export function renderScheduler(container) {
  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card p-5">
        <h3 class="font-medium mb-4">Auto-Restart</h3>
        <label class="flex items-center gap-3 mb-4 cursor-pointer">
          <input type="checkbox" id="chk-restart" class="w-4 h-4 accent-[var(--accent)]">
          <span class="text-sm">Aktiviert</span>
        </label>
        <div>
          <label class="text-sm text-panel-dim">Uhrzeit</label>
          <input type="time" id="restart-time" class="w-full mt-1 px-3 py-2.5">
        </div>
      </div>
      <div class="card p-5">
        <h3 class="font-medium mb-4">Auto-Backup</h3>
        <label class="flex items-center gap-3 mb-4 cursor-pointer">
          <input type="checkbox" id="chk-backup" class="w-4 h-4 accent-[var(--accent)]">
          <span class="text-sm">Aktiviert</span>
        </label>
        <div>
          <label class="text-sm text-panel-dim">Uhrzeit</label>
          <input type="time" id="backup-time" class="w-full mt-1 px-3 py-2.5">
        </div>
      </div>
    </div>
    <button id="btn-save-sched" class="btn-primary w-full mt-4 py-3 text-sm">Speichern</button>`;

  loadScheduler();
  document.getElementById('btn-save-sched').addEventListener('click', saveScheduler);
  return null;
}

async function loadScheduler() {
  try {
    const d = await api('GET', '/scheduler');
    document.getElementById('chk-restart').checked = d.autoRestart || false;
    document.getElementById('restart-time').value = d.restartTime || '04:00';
    document.getElementById('chk-backup').checked = d.autoBackup || false;
    document.getElementById('backup-time').value = d.backupTime || '03:00';
  } catch { /* ignore */ }
}

async function saveScheduler() {
  try {
    await api('POST', '/scheduler', {
      autoRestart: document.getElementById('chk-restart').checked,
      restartTime: document.getElementById('restart-time').value,
      autoBackup: document.getElementById('chk-backup').checked,
      backupTime: document.getElementById('backup-time').value,
    });
    showToast('Gespeichert');
  } catch { showToast('Fehler', 'error'); }
}
