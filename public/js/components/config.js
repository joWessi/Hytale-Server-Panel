// Config editor component
import { api } from '../api.js';
import { showToast } from '../utils.js';

let currentFile = '';

export function renderConfig(container) {
  const canWrite = window.__panelUser?.role === 'admin' || window.__panelUser?.permissions?.includes('config.write');
  const saveBtn = canWrite ? '<button id="btn-save-cfg" class="btn-primary px-4 py-2 text-sm hidden">Speichern</button>' : '';

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="card p-4">
        <h3 class="font-medium text-sm mb-3">Dateien</h3>
        <div id="cfg-files" class="space-y-1 text-sm"></div>
      </div>
      <div class="lg:col-span-2 card p-4 flex flex-col">
        <div class="flex items-center justify-between mb-3">
          <span id="cfg-filename" class="text-sm text-panel-dim font-mono">Datei auswaehlen</span>
          ${saveBtn}
        </div>
        <textarea id="cfg-editor" class="console-box flex-1 rounded-lg p-3 resize-none" rows="20" disabled placeholder="Waehle eine Datei..."></textarea>
      </div>
    </div>`;

  loadConfigFiles();

  if (canWrite) {
    document.getElementById('btn-save-cfg')?.addEventListener('click', saveConfig);
  }
  return null;
}

async function loadConfigFiles() {
  try {
    const d = await api('GET', '/config/files');
    const el = document.getElementById('cfg-files');
    if (!d.files?.length) { el.innerHTML = '<div class="text-panel-dim">Keine Dateien</div>'; return; }

    const important = ['config.json', 'whitelist.json', 'bans.json', 'permissions.json'];
    const rootFiles = [];
    const folders = {};

    d.files.forEach(f => {
      if (!f.includes('/')) {
        rootFiles.push(f);
      } else {
        const folder = f.split('/')[0];
        if (!folders[folder]) folders[folder] = [];
        folders[folder].push(f);
      }
    });

    rootFiles.sort((a, b) => {
      const ai = important.indexOf(a), bi = important.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });

    let html = rootFiles.map(f => {
      const star = important.includes(f) ? '<span class="text-amber-400 mr-1">*</span>' : '';
      return `<div class="p-2 rounded cursor-pointer hover:bg-panel-border/50 truncate" data-file="${f}">${star}${f}</div>`;
    }).join('');

    Object.keys(folders).sort().forEach(folder => {
      html += `<div class="mt-2">
        <div class="flex items-center gap-1 text-xs text-panel-dim uppercase tracking-wide mb-1 cursor-pointer" data-toggle="${folder}">
          <span class="toggle-arrow">&#9654;</span> ${folder} (${folders[folder].length})
        </div>
        <div class="hidden pl-2 border-l border-panel-border space-y-1" data-folder="${folder}">
          ${folders[folder].map(f => `<div class="p-1.5 rounded cursor-pointer hover:bg-panel-border/50 truncate" data-file="${f}" title="${f}">${f.split('/').pop()}</div>`).join('')}
        </div>
      </div>`;
    });

    el.innerHTML = html;

    // File click handlers
    el.querySelectorAll('[data-file]').forEach(item => {
      item.addEventListener('click', () => loadConfigFile(item.dataset.file));
    });

    // Folder toggle handlers
    el.querySelectorAll('[data-toggle]').forEach(item => {
      item.addEventListener('click', () => {
        const folder = document.querySelector(`[data-folder="${item.dataset.toggle}"]`);
        const arrow = item.querySelector('.toggle-arrow');
        if (folder) {
          folder.classList.toggle('hidden');
          arrow.innerHTML = folder.classList.contains('hidden') ? '&#9654;' : '&#9660;';
        }
      });
    });
  } catch { /* ignore */ }
}

async function loadConfigFile(filename) {
  currentFile = filename;
  try {
    const d = await api('GET', `/config/read?file=${encodeURIComponent(filename)}`);
    if (d.content !== undefined) {
      document.getElementById('cfg-filename').textContent = filename;
      const editor = document.getElementById('cfg-editor');
      editor.value = d.content;
      editor.disabled = !(window.__panelUser?.role === 'admin' || window.__panelUser?.permissions?.includes('config.write'));
      const saveBtn = document.getElementById('btn-save-cfg');
      if (saveBtn) saveBtn.classList.remove('hidden');
    }
  } catch { showToast('Fehler beim Laden', 'error'); }
}

async function saveConfig() {
  if (!currentFile) return;
  try {
    const d = await api('POST', '/config/write', {
      file: currentFile,
      content: document.getElementById('cfg-editor').value,
    });
    if (d.success) showToast('Gespeichert');
    else showToast(d.error || 'Fehler', 'error');
  } catch { showToast('Fehler', 'error'); }
}
