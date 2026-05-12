// Hytale Panel - Frontend Entry Point
import { api, logout } from './api.js';
import { route, initRouter, navigate } from './router.js';
import { renderLogin } from './components/login.js';
import { renderLayout } from './components/layout.js';
import { renderDashboard } from './components/dashboard.js';
import { renderConsole } from './components/console.js';
import { renderFiles } from './components/files.js';
import { renderConfig } from './components/config.js';
import { renderBackups } from './components/backups.js';
import { renderScheduler } from './components/scheduler.js';
import { renderUsers } from './components/users.js';
import { renderPlayers } from './components/players.js';
import { renderSettings } from './components/settings.js';
import { renderSetupWizard } from './components/setup-wizard.js';
import { showToast, darkenHex, confirmDialog } from './utils.js';

window.__panelUser = null;
let sessionTimeout = 30;
let lastActivity = Date.now();
let warnShown = false;
let mainContent = null;

async function loadTheme() {
  try {
    const theme = await fetch('/api/theme').then(r => r.json());
    const root = document.documentElement.style;
    if (theme.accentColor) {
      root.setProperty('--accent', theme.accentColor);
      root.setProperty('--accent-hover', darkenHex(theme.accentColor, 0.15));
    }
    if (theme.cardColor) root.setProperty('--card', theme.cardColor);
    if (theme.bgColor) root.setProperty('--bg', theme.bgColor);
    if (theme.panelName) document.title = theme.panelName;
  } catch { /* defaults */ }
}

async function checkAuth() {
  try { return await api('GET', '/users/me'); }
  catch { return null; }
}

async function init() {
  await loadTheme();
  const appEl = document.getElementById('app');
  const user = await checkAuth();

  if (!user) {
    renderLogin(appEl, () => location.reload());
    return;
  }

  if (user.mustChangePassword) {
    showPasswordChangeBlocker(appEl, user);
    return;
  }

  if (!user.serverInstalled) {
    window.__panelUser = user;
    renderSetupWizard(appEl, { isUpdate: false });
    return;
  }

  showMainApp(appEl, user);
}

function showPasswordChangeBlocker(appEl, user) {
  appEl.innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="card p-8 w-full max-w-md">
        <h1 class="text-xl font-bold mb-1">Passwort ändern</h1>
        <p class="text-sm text-panel-dim mb-6">Hallo ${user.username}, du musst dein Passwort ändern bevor du das Panel nutzen kannst.</p>
        <form id="pwc-form" class="space-y-3">
          <input type="password" id="pwc-current" class="w-full px-3 py-2.5 text-sm" placeholder="Aktuelles Passwort" required>
          <input type="password" id="pwc-new" class="w-full px-3 py-2.5 text-sm" placeholder="Neues Passwort (min. 8 Zeichen)" minlength="8" required>
          <input type="password" id="pwc-new2" class="w-full px-3 py-2.5 text-sm" placeholder="Neues Passwort wiederholen" minlength="8" required>
          <p id="pwc-err" class="text-red-400 text-sm hidden"></p>
          <button type="submit" class="btn-primary w-full py-2.5 text-sm">Ändern</button>
        </form>
        <button id="pwc-logout" class="mt-4 text-xs text-panel-dim hover:text-panel-text w-full text-center">Abmelden</button>
      </div>
    </div>`;
  const err = document.getElementById('pwc-err');
  document.getElementById('pwc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.add('hidden');
    const cur = document.getElementById('pwc-current').value;
    const a = document.getElementById('pwc-new').value;
    const b = document.getElementById('pwc-new2').value;
    if (a !== b) { err.textContent = 'Neue Passwörter stimmen nicht überein'; err.classList.remove('hidden'); return; }
    try {
      await api('POST', '/users/me/password', { currentPassword: cur, newPassword: a });
      showToast('Passwort geändert - bitte neu anmelden');
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      err.textContent = e.message;
      err.classList.remove('hidden');
    }
  });
  document.getElementById('pwc-logout').addEventListener('click', () => logout());
}

function showMainApp(appEl, user) {
  window.__panelUser = user;
  sessionTimeout = user.sessionTimeout || 30;

  mainContent = renderLayout(appEl, user);

  route('dashboard', (c) => renderDashboard(c));
  route('console', (c) => renderConsole(c));
  route('files', (c) => renderFiles(c));
  route('config', (c) => renderConfig(c));
  route('backups', (c) => renderBackups(c));
  route('scheduler', (c) => renderScheduler(c));
  route('users', (c) => renderUsers(c));
  route('players', (c) => renderPlayers(c));
  route('settings', (c) => renderSettings(c));
  route('update', (c) => renderSetupWizard(c, { isUpdate: true }));
  route('login', () => { navigate('dashboard'); return null; });

  initRouter(() => mainContent);

  document.addEventListener('click', resetActivity);
  document.addEventListener('keydown', resetActivity);

  setInterval(checkSessionExpiry, 30000);
}

function resetActivity() {
  lastActivity = Date.now();
  warnShown = false;
}

async function checkSessionExpiry() {
  if (sessionTimeout <= 0) return;
  const inactiveMin = (Date.now() - lastActivity) / 60000;
  if (inactiveMin >= sessionTimeout) {
    showToast('Session abgelaufen', 'warning');
    logout();
    return;
  }
  if (!warnShown && inactiveMin >= sessionTimeout - 1) {
    warnShown = true;
    const stay = await confirmDialog(
      `Deine Session läuft in 1 Minute ab.\nWeiterhin angemeldet bleiben?`,
      { ok: 'Bleiben', cancel: 'Abmelden' }
    );
    if (stay) {
      // Activity nudge re-issues sliding cookie + resets timer
      api('GET', '/users/me').catch(() => {});
      resetActivity();
    } else {
      logout();
    }
  }
}

init();
