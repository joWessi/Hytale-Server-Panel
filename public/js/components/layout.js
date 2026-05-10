// Layout component: sidebar + header shell
import { logout } from '../api.js';
import { navigate, getCurrentRoute } from '../router.js';

const NAV_ITEMS = [
  { hash: 'dashboard', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z', label: 'Dashboard', perm: null },
  { hash: 'console', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', label: 'Konsole', perm: 'console.read' },
  { hash: 'files', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z', label: 'Dateien', perm: 'files.read' },
  { hash: 'config', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', label: 'Konfiguration', perm: 'config.read' },
  { hash: 'backups', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12', label: 'Backups', perm: 'backups.read' },
  { hash: 'scheduler', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Scheduler', perm: 'scheduler.manage' },
  { hash: 'users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', label: 'Benutzer', perm: 'users.manage' },
  { hash: 'settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', label: 'Einstellungen', perm: 'settings.manage' },
];

export function renderLayout(container, user) {
  const hasPerm = (p) => {
    if (!p) return true;
    if (user.role === 'admin') return true;
    return user.permissions?.includes(p);
  };

  container.innerHTML = `
    <div id="sidebar-overlay" class="sidebar-overlay fixed inset-0 bg-black/60 z-40 md:hidden hidden" ></div>
    <aside id="sidebar" class="sidebar fixed top-0 left-0 h-full w-60 z-50 flex flex-col">
      <div class="p-5 border-b border-panel-border text-center">
        <div class="text-xl font-bold text-panel-accent">HYTALE</div>
        <div class="text-[10px] text-panel-dim mt-1 tracking-[0.2em] uppercase">Server Panel</div>
      </div>
      <nav class="flex-1 p-3 overflow-y-auto space-y-0.5" id="nav-menu"></nav>
      <div class="p-4 border-t border-panel-border">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-8 h-8 rounded-full bg-panel-border flex items-center justify-center text-panel-accent text-sm font-bold">${user.username.charAt(0).toUpperCase()}</div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">${user.username}</div>
            <div class="text-xs text-panel-dim">${user.role === 'admin' ? 'Administrator' : 'Benutzer'}</div>
          </div>
        </div>
        <div class="flex justify-between items-center pt-3 border-t border-panel-border">
          <span class="text-xs text-panel-dim">v4.0.0</span>
          <button id="btn-logout" class="text-xs text-red-400 hover:text-red-300">Logout</button>
        </div>
      </div>
    </aside>
    <div class="md:ml-60 min-h-screen flex flex-col">
      <header class="py-3 px-4 flex justify-between items-center bg-panel-bg/95 border-b border-panel-border sticky top-0 z-30 backdrop-blur-sm">
        <div class="flex items-center gap-3">
          <button id="btn-sidebar" class="md:hidden p-2 hover:bg-panel-border rounded-lg">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <h1 id="page-title" class="text-lg font-semibold">Dashboard</h1>
        </div>
        <div class="flex items-center gap-2">
          <div id="quick-status" class="w-2.5 h-2.5 rounded-full bg-panel-border"></div>
          <span id="quick-status-text" class="text-sm text-panel-dim hidden sm:inline">--</span>
        </div>
      </header>
      <main id="main-content" class="flex-1 p-4 max-w-7xl w-full mx-auto"></main>
    </div>`;

  // Build navigation
  const navMenu = document.getElementById('nav-menu');
  navMenu.innerHTML = NAV_ITEMS.filter(item => hasPerm(item.perm)).map(item => `
    <a href="#${item.hash}" class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm" data-nav="${item.hash}">
      <svg class="w-5 h-5 text-panel-dim flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${item.icon}"/>
      </svg>
      <span>${item.label}</span>
    </a>`).join('');

  // Sidebar toggle
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const closeSidebar = () => { sidebar.classList.remove('open'); overlay.classList.add('hidden'); };

  document.getElementById('btn-sidebar').addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('hidden');
  });
  overlay.addEventListener('click', closeSidebar);

  // Close sidebar on navigation (mobile)
  navMenu.addEventListener('click', closeSidebar);

  // Logout
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Highlight active nav item
  updateActiveNav();
  window.addEventListener('hashchange', updateActiveNav);

  return document.getElementById('main-content');
}

function updateActiveNav() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === hash);
  });

  // Update page title
  const item = NAV_ITEMS.find(i => i.hash === hash);
  const title = document.getElementById('page-title');
  if (title && item) title.textContent = item.label;
}

export function setQuickStatus(running) {
  const dot = document.getElementById('quick-status');
  const text = document.getElementById('quick-status-text');
  if (dot) dot.className = `w-2.5 h-2.5 rounded-full ${running ? 'status-online' : 'status-offline'}`;
  if (text) text.textContent = running ? 'Online' : 'Offline';
}
