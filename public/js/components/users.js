// User management
import { api } from '../api.js';
import { showToast, confirmDialog, promptDialog, escapeHtml } from '../utils.js';

const PERM_LABELS = {
  'server.control': 'Server steuern',
  'console.read': 'Konsole lesen',
  'console.write': 'Konsole schreiben',
  'files.read': 'Dateien lesen',
  'files.write': 'Dateien schreiben',
  'config.read': 'Konfiguration lesen',
  'config.write': 'Konfiguration schreiben',
  'backups.read': 'Backups lesen',
  'backups.manage': 'Backups verwalten',
  'scheduler.manage': 'Scheduler verwalten',
  'users.manage': 'Benutzer verwalten',
  'settings.manage': 'Einstellungen verwalten',
};

const UUID_RE = /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/;

let usersCache = [];
let selectedUser = null;

export function renderUsers(container) {
  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 card p-4">
        <div class="flex justify-between items-center mb-4">
          <h3 class="font-medium">Benutzer</h3>
          <button id="btn-toggle-add" class="btn-primary px-3 py-1.5 text-sm">Hinzufügen</button>
        </div>
        <div id="user-list" class="space-y-1"></div>
      </div>
      <div class="space-y-4">
        <div id="edit-panel" class="card p-4">
          <h3 class="font-medium mb-3">Bearbeiten</h3>
          <div id="edit-user-name" class="text-sm text-panel-dim mb-3">Wähle einen Benutzer</div>
          <div class="space-y-3">
            <div>
              <label class="text-xs text-panel-dim uppercase">Rolle</label>
              <select id="edit-role" class="w-full mt-1 px-3 py-2"><option value="user">User</option><option value="admin">Admin</option></select>
            </div>
            <div>
              <label class="text-xs text-panel-dim uppercase">UUID (Whitelist)</label>
              <input type="text" id="edit-uuid" class="w-full mt-1 px-3 py-2 text-sm font-mono" placeholder="UUID eingeben...">
              <p id="edit-uuid-err" class="hidden text-xs text-red-400 mt-1"></p>
            </div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="edit-enabled" class="w-4 h-4 accent-[var(--accent)]">
              <span class="text-sm">Freigegeben (Whitelist)</span>
            </label>
            <div id="edit-perms-wrap">
              <label class="text-xs text-panel-dim uppercase">Berechtigungen</label>
              <div id="edit-perms" class="mt-2 space-y-1.5"></div>
            </div>
            <div class="flex gap-2">
              <button id="btn-save-user" class="flex-1 btn-primary py-2 text-sm">Speichern</button>
              <button id="btn-reset-pw" class="btn-warning px-3 py-2 text-sm" disabled>Passwort</button>
              <button id="btn-del-user" class="btn-danger px-3 py-2 text-sm" disabled>Löschen</button>
            </div>
          </div>
        </div>
        <div id="add-panel" class="card p-4 hidden">
          <h3 class="font-medium mb-3">Neuer Benutzer</h3>
          <div class="space-y-3">
            <input type="text" id="new-user" class="w-full px-3 py-2 text-sm" placeholder="Benutzername (3-32 Zeichen)">
            <input type="password" id="new-pass" class="w-full px-3 py-2 text-sm" placeholder="Passwort (min. 8 Zeichen)">
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
  document.getElementById('btn-reset-pw').addEventListener('click', resetPassword);

  document.getElementById('edit-uuid').addEventListener('input', validateUuidField);

  loadUsers();
  return null;
}

function validateUuidField() {
  const input = document.getElementById('edit-uuid');
  const err = document.getElementById('edit-uuid-err');
  const v = input.value.trim();
  if (!v) { err.classList.add('hidden'); return true; }
  if (!UUID_RE.test(v)) {
    err.textContent = 'Ungültiges Format';
    err.classList.remove('hidden');
    return false;
  }
  err.classList.add('hidden');
  return true;
}

async function loadUsers() {
  try {
    const d = await api('GET', '/users');
    usersCache = d.users || [];
    const list = document.getElementById('user-list');
    list.innerHTML = usersCache.map(u => {
      const roleClass = u.role === 'admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-panel-accent/20 text-panel-accent';
      const statusDot = u.enabled !== false ? 'bg-panel-accent' : 'bg-red-500';
      const uuidBadge = u.uuid ? '<span class="text-[10px] text-panel-dim ml-1">UUID</span>' : '';
      return `<div class="flex items-center gap-3 p-2.5 rounded-lg bg-panel-bg hover:bg-panel-border/50 cursor-pointer text-sm" data-username="${escapeHtml(u.username)}">
        <div class="w-2 h-2 rounded-full ${statusDot}"></div>
        <span class="flex-1 font-medium">${escapeHtml(u.username)}${uuidBadge}</span>
        <span class="px-2 py-0.5 rounded text-xs font-medium ${roleClass}">${u.role === 'admin' ? 'ADMIN' : 'USER'}</span>
      </div>`;
    }).join('');

    list.querySelectorAll('[data-username]').forEach(el => {
      el.addEventListener('click', () => showEditUser(el.dataset.username));
    });
  } catch (e) { showToast(e.message, 'error'); }
}

function showEditUser(username) {
  const user = usersCache.find(u => u.username === username);
  if (!user) return;
  selectedUser = username;

  document.getElementById('edit-user-name').textContent = user.username;
  document.getElementById('edit-role').value = user.role;
  document.getElementById('edit-uuid').value = user.uuid || '';
  document.getElementById('edit-enabled').checked = user.enabled !== false;
  document.getElementById('edit-uuid-err').classList.add('hidden');

  const delBtn = document.getElementById('btn-del-user');
  const resetBtn = document.getElementById('btn-reset-pw');
  const permsWrap = document.getElementById('edit-perms-wrap');
  const permsDiv = document.getElementById('edit-perms');

  const isAdmin = user.username === 'admin';
  document.getElementById('edit-role').disabled = isAdmin;
  document.getElementById('edit-enabled').disabled = isAdmin;
  delBtn.disabled = isAdmin;
  resetBtn.disabled = user.username === window.__panelUser.username;

  if (user.role === 'admin') {
    permsWrap.classList.add('opacity-50');
    permsDiv.innerHTML = '<div class="text-xs text-panel-dim p-2 rounded bg-panel-bg">Admin hat alle Rechte</div>';
  } else {
    permsWrap.classList.remove('opacity-50');
    const perms = user.permissions || [];
    permsDiv.innerHTML = Object.entries(PERM_LABELS).map(([key, label]) =>
      `<label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" value="${key}" ${perms.includes(key) ? 'checked' : ''} class="w-3.5 h-3.5 accent-[var(--accent)]">
        <span class="text-sm">${escapeHtml(label)}</span>
      </label>`).join('');
  }
}

async function saveUser() {
  if (!selectedUser) return;
  if (!validateUuidField()) { showToast('UUID ungültig', 'error'); return; }

  const data = { uuid: document.getElementById('edit-uuid').value };
  if (selectedUser !== 'admin') {
    data.enabled = document.getElementById('edit-enabled').checked;
    data.role = document.getElementById('edit-role').value;
    if (data.role !== 'admin') {
      data.permissions = [...document.querySelectorAll('#edit-perms input:checked')].map(i => i.value);
    }
  }
  try {
    await api('PATCH', `/users/${selectedUser}`, data);
    showToast('Aktualisiert');
    loadUsers();
  } catch (e) { showToast(e.message, 'error'); }
}

async function createUser() {
  const username = document.getElementById('new-user').value.trim();
  const password = document.getElementById('new-pass').value;
  if (!username || !password) { showToast('Benutzername und Passwort erforderlich', 'error'); return; }
  try {
    await api('POST', '/users', { username, password, role: document.getElementById('new-role').value });
    showToast('Erstellt');
    document.getElementById('add-panel').classList.add('hidden');
    document.getElementById('new-user').value = '';
    document.getElementById('new-pass').value = '';
    loadUsers();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteUser() {
  if (!selectedUser || selectedUser === 'admin') return;
  const ok = await confirmDialog(`Benutzer "${selectedUser}" löschen?`, { danger: true, ok: 'Löschen' });
  if (!ok) return;
  try {
    await api('DELETE', `/users/${selectedUser}`);
    showToast('Gelöscht');
    selectedUser = null;
    document.getElementById('edit-user-name').textContent = 'Wähle einen Benutzer';
    loadUsers();
  } catch (e) { showToast(e.message, 'error'); }
}

async function resetPassword() {
  if (!selectedUser) return;
  const pw = await promptDialog(
    `Neues Passwort für "${selectedUser}" (min. 8 Zeichen).\nDer Benutzer muss es beim nächsten Login ändern.`,
    '', { type: 'password', ok: 'Setzen' }
  );
  if (!pw) return;
  if (pw.length < 8) { showToast('Mindestens 8 Zeichen', 'error'); return; }
  try {
    await api('POST', `/users/${selectedUser}/reset-password`, { newPassword: pw });
    showToast('Passwort gesetzt');
  } catch (e) { showToast(e.message, 'error'); }
}
