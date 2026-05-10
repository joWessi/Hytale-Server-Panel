// Hytale Panel v4.0.0 - Frontend Entry Point
import { api } from './api.js';
import { route, initRouter, navigate } from './router.js';
import { renderLogin } from './components/login.js';
import { renderLayout, setQuickStatus } from './components/layout.js';
import { renderDashboard } from './components/dashboard.js';
import { renderConsole } from './components/console.js';
import { renderFiles } from './components/files.js';
import { renderConfig } from './components/config.js';
import { renderBackups } from './components/backups.js';
import { renderScheduler } from './components/scheduler.js';
import { renderUsers } from './components/users.js';
import { renderSettings } from './components/settings.js';
import { showToast } from './utils.js';

// Global user state (accessible via window.__panelUser for permission checks)
window.__panelUser = null;
let sessionTimeout = 30;
let lastActivity = Date.now();
let mainContent = null;

// Load theme colors
async function loadTheme() {
  try {
    const theme = await fetch('/api/theme').then(r => r.json());
    const root = document.documentElement.style;
    if (theme.accentColor) root.setProperty('--accent', theme.accentColor);
    if (theme.cardColor) root.setProperty('--card', theme.cardColor);
    if (theme.bgColor) root.setProperty('--bg', theme.bgColor);
  } catch { /* use defaults */ }
}

// Check authentication
async function checkAuth() {
  try {
    const user = await api('GET', '/users/me');
    return user;
  } catch {
    return null;
  }
}

// Initialize the app
async function init() {
  await loadTheme();
  const appEl = document.getElementById('app');
  const user = await checkAuth();

  if (!user) {
    showLoginScreen(appEl);
    return;
  }

  showMainApp(appEl, user);
}

function showLoginScreen(appEl) {
  renderLogin(appEl, (loginData) => {
    // Login successful, reload
    window.location.hash = '#dashboard';
    window.location.reload();
  });
}

function showMainApp(appEl, user) {
  window.__panelUser = user;
  sessionTimeout = user.sessionTimeout || 30;

  // Render layout and get main content container
  mainContent = renderLayout(appEl, user);

  // Register routes
  route('dashboard', (c) => renderDashboard(c));
  route('console', (c) => renderConsole(c));
  route('files', (c) => renderFiles(c));
  route('config', (c) => renderConfig(c));
  route('backups', (c) => renderBackups(c));
  route('scheduler', (c) => renderScheduler(c));
  route('users', (c) => renderUsers(c));
  route('settings', (c) => renderSettings(c));

  // Handle login route when already authenticated
  route('login', () => { navigate('dashboard'); return null; });

  // Start router
  initRouter(() => mainContent);

  // Activity tracking for session timeout
  document.addEventListener('click', resetActivity);
  document.addEventListener('keypress', resetActivity);

  setInterval(() => {
    if (sessionTimeout > 0) {
      const inactiveMin = (Date.now() - lastActivity) / 1000 / 60;
      if (inactiveMin >= sessionTimeout) {
        showToast('Session abgelaufen', 'warning');
        import('./api.js').then(({ logout }) => logout());
      }
    }
  }, 60000);
}

function resetActivity() {
  lastActivity = Date.now();
}

// Go!
init();
