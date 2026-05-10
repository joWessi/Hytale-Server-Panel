// User management component
import { api } from '../api.js';
import { showToast } from '../utils.js';

const ALL_PERMS = [
  { key: 'server.control', label: 'Server steuern' },
  { key: 'console.read', label: 'Konsole lesen' },
  { key: 'console.write', label: 'Konsole schreiben' },
  { key: 'files.read', label: 'Dateien lesen' },
  { key: 'files.write', label: 'Dateien schreiben' },
  { key: 'config.read', label: 'Konfiguration lesen' },
  { key: 'config.write', label: 'Konfiguration schreiben' },
  { key: 'backups.read', label: 'Backups lesen' },
  { key: 'backups.manage', label: 'Backups verwalten' },
  { key: 'scheduler.manage', label: 'Scheduler verwalten' },
  { key: 'users.manage', label: 'Benutzer verwalten' },
  { key: 'settings.manage', label: 'Einstellungen verwalten' },
];

let usersCache = [];

export function renderUsers(container) {
  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 card p-4">
        <div class="flex justify-between items-center mb-4">
          <h3 class="font-medium">Benutzer</h3>
          <button id="btn-toggle-add" class="btn-primary px-3 py-1.5 text-sm">Hinzufuegen</button>
        </div>
        <div id="user-list" class="space-y-1"></div>
      </div>
      <div class="space-y-4">
        <div id="edit-panel" class="card p-4">
          <h3 class="font-medium mb-3">Bearbeiten</h3>
          <div id="edit-user-name" class="text-sm text-panel-dim mb-3">Waehle einen Benutzer</div>
          <div class="space-y-3">
            <div>
              <label class="text-xs text-panel-dim uppercase">Rolle</label>
              <select id="edit-role" class="w-full mt-1 px-3 py-2"><option value="user">User</option><option value="admin">Admin</option></select>
            </div>
            <div>
              <label class="text-xs text-panel-dim uppercase">UUID (Whitelist)</label>
              <input type="text" id="edit-uuid" class="w-full mt-1 px-3 py-2 text-sm font-mono" placeholder="UUID eingeben...">
            </div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="edit-enabled" class="w-4 h-4 accent-[var(--accent)]">
              <span class="text-sm">Freigegeben (Whitelist)</span>
            </label>
            <div>
              <label class="text-xs text-panel-dim uppercase">Berechtigungen</label>
              <div id="edit-perms" class="mt-2 space-y-1.5"></div>
            </div>
            <div class="flex gap-2">
              <button id="btn-save-user" class="flex-1 btn-primary py-2 text-sm">Speichern</button>
              <button id="btn-del-user" class="btn-danger px-4 py-2 text-sm" disabled>Loeschen</button>
            </div>
          </div>
        </div>
        <div id="add-panel" class="card p-4 hidden">
          <h3 class="font-medium mb-3">Neuer Benutzer</h3>
          <div class="space-y-3">
            <input type="text" id="new-user" class="w-full px-3 py-2 text-sm" placeholder="Benutzername">
            <input type="password" id="new-pass" class="w-full px-3 py-2 text-sm" placeholder="Passwort">
            <select id="new-role" class="w-full px-3 py-2 text-sm"><option value="user">User</option><option value="admin">Admin</option></select>
            <button id="btn-create-user" class="btn-primary w-full py-2 text-sm">Erstellen</button>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('btn-toggle-add').addEventListener('click', () => {
    document.getElementById('add-panel').classList.toggle('hidden');
  });
  document.getElementById('btn-create-user').addEventListener('click', createUser);
  document.getElementById('btn-save-user').addEventListener('click', saveUser);
  document.getElementById('btn-del-user').addEventListener('click', deleteUser);

  loadUsers();
  return null;
}

async function loadUsers() {
  try {
    const d = await api('GET', '/users');
    usersCache = d.users || [];
    const list = document.getElementById('user-list');
    list.innerHTML = usersCache.map(u => {
      const roleClass = u.role === 'admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-panel-accent/20 text-panel-accent';
      const statusDot = u.enabled !== false ? 'bg-panel-accent' : 'bg-red-500';
      return `<div class="flex items-center gap-3 p-2.5 rounded-lg bg-panel-bg hover:bg-panel-border/50 cursor-pointer text-sm" data-username="${u.username}">
        <div class="w-2 h-2 rounded-full ${statusDot}"></div>
        <span class="flex-1 font-medium">${u.username}</span>
        <span class="px-2 py-0.5 rounded text-xs font-medium ${roleClass}">${u.role === 'admin' ? 'ADMIN' : 'USER'}</span>
      </div>`;
    }).join('');

    list.querySelectorAll('[data-username]').forEach(el => {
      el.addEventListener('click', () => showEditUser(el.dataset.username));
    });
  } catch { /* ignore */ }
}

function showEditUser(username) {
  const user = usersCache.find(u => u.username === username);
  if (!user) return;

  document.getElementById('edit-user-name').textContent = user.username;
  document.getElementById('edit-user-name').dataset.username = user.username;
  document.getElementById('edit-role').value = user.role;
  document.getElementById('edit-uuid').value = user.uuid || '';
  document.getElementById('edit-enabled').checked = user.enabled !== false;

  const delBtn = document.getElementById('btn-del-user');
  const permsDiv = document.getElementById('edit-perms');

  if (user.username === 'admin' || user.role === 'admin') {
    document.getElementById('edit-role').disabled = user.username === 'admin';
    delBtn.disabled = user.username === 'admin';
    permsDiv.innerHTML = '<div class="text-xs text-panel-dim p-2 rounded bg-panel-bg">Admin hat alle Rechte</div>';
    return;
  }

  document.getElementById('edit-role').disabled = false;
  delBtn.disabled = false;
  const perms = user.permissions || [];
  permsDiv.innerHTML = ALL_PERMS.map(p =>
    `<label class="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" value="${p.key}" ${perms.includes(p.key) ? 'checked' : ''} class="w-3.5 h-3.5 accent-[var(--accent)]">
      <span class="text-sm">${p.label}</span>
    </label>`
  ).join('');
}

async function saveUser() {
  const username = document.getElementById('edit-user-name').dataset?.username;
  if (!username || username === 'admin') return;
  const data = {
    role: document.getElementById('edit-role').value,
    uuid: document.getElementById('edit-uuid').value,
    enabled: document.getElementById('edit-enabled').checked,
  };
  if (data.role !== 'admin') {
    data.permissions = [...document.querySelectorAll('#edit-perms input:checked')].map(i => i.value);
  }
  try {
    await api('PATCH', `/users/${username}`, data);
    showToast('Aktualisiert');
    loadUsers();
  } catch { showToast('Fehler', 'error'); }
}

async function createUser() {
  const username = document.getElementById('new-user').value.trim();
  const password = document.getElementById('new-pass').value;
  if (!username || !password) { showToast('Benutzername und Passwort erforderlich', 'error'); return; }
  try {
    const d = await api('POST', '/users', { username, password, role: document.getElementById('new-role').value });
    if (d.success) {
      showToast('Erstellt');
      document.getElementById('add-panel').classList.add('hidden');
      document.getElementById('new-user').value = '';
      document.getElementById('new-pass').value = '';
      loadUsers();
    } else showToast(d.error || 'Fehler', 'error');
  } catch { showToast('Fehler', 'error'); }
}

async function deleteUser() {
  const username = document.getElementById('edit-user-name').dataset?.username;
  if (!username || username === 'admin') return;
  if (!confirm(`Benutzer "${username}" loeschen?`)) return;
  try {
    await api('DELETE', `/users/${username}`);
    showToast('Geloescht');
    loadUsers();
  } catch { showToast('Fehler', 'error'); }
}
